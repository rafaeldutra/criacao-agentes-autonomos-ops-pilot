import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { createOpenRouterModel } from "./model.js";
import { createTools, type AgentTools } from "./tools.js";
import { maxIterations } from "./strategy.js";
import { action, answer, critique, observation, plan as planEvent } from "./trace.js";
import type { ReasoningInput, ReasoningOptions, ReasoningResult, ReasoningStrategy, TraceEvent } from "./types.js";

const planSchema = z.object({
  steps: z.array(z.string().min(1)).max(8).describe("passos curtos, ordenados e executaveis com as ferramentas disponíveis"),
});

const replannerSchema = z.object({
  decision: z.enum(["adjust", "follow", "end"]),
  steps: z.array(z.string().min(1)).max(8).optional(),
  reason: z.string().min(1),
});

const PLANNER_PROMPT =
  "Você é o planner do OpsPilot. Crie passos curtos, ordenados e executáveis usando apenas as tools disponíveis. " +
  "Planeje no máximo 8 passos. Retorne somente a lista estruturada de passos.";
const REPLANNER_PROMPT =
  "Você é o replanner do OpsPilot. Após cada passo executado, decida se deve ajustar o plano, seguir o plano ou encerrar. " +
  "Use 'end' quando a solicitação estiver resolvida. Se ajustar, forneça a lista restante.";

const PEState = Annotation.Root({
  input: Annotation<string>(),
  plan: Annotation<string[]>({ reducer: (_, value) => value, default: () => [] }),
  done: Annotation<[string, string][]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  answer: Annotation<string>({ reducer: (_, value) => value, default: () => "" }),
  decision: Annotation<"adjust" | "follow" | "end">({ reducer: (_, value) => value, default: () => "follow" }),
  trace: Annotation<TraceEvent[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  iterations: Annotation<number>({ reducer: (_, value) => value, default: () => 0 }),
  llmCalls: Annotation<number>({ reducer: (_, value) => value, default: () => 0 }),
});

const serialize = (value: unknown): string =>
  typeof value === "string" ? value : JSON.stringify(value);

const toolError = (error: unknown): string =>
  `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;

const createPlanGraph = (
  model: ReturnType<typeof createOpenRouterModel>,
  tools: AgentTools,
  iterationLimit: number,
  useReplanner: boolean,
) => {
  const planner = async (state: typeof PEState.State) => {
    const result = await model.withStructuredOutput(planSchema).invoke([
      new SystemMessage(PLANNER_PROMPT),
      new HumanMessage(state.input),
    ]);
    const steps = result.steps.slice(0, 8);
    return {
      plan: steps,
      trace: [planEvent(steps.map((description, index) => ({ id: index + 1, description, status: "pending" as const })))],
      llmCalls: 1,
    };
  };

  const executor = async (state: typeof PEState.State) => {
    const [step, ...remaining] = state.plan;
    if (!step) return { decision: "end" as const, answer: "No steps remain.", trace: [answer("No steps remain.")] };

    const executorModel = model.bindTools(Object.values(tools));
    const response = await executorModel.invoke([
      new SystemMessage(
        "Execute exactly one operational step with the available tools. Do not execute multiple steps. " +
          "For list_alerts, omit status when no filter is requested; if provided, status must be exactly firing or resolved.",
      ),
      new HumanMessage(step),
    ]);
    const toolCall = response.tool_calls?.[0];
    if (!toolCall) {
      const result = serialize(response.content);
      return {
        plan: remaining,
        done: [[step, result] as [string, string]],
        trace: [observation(result)],
        iterations: state.iterations + 1,
        llmCalls: state.llmCalls + 1,
      };
    }

    const tool = Object.values(tools).find((candidate) => candidate.name === toolCall.name);
    if (!tool) throw new Error(`Unknown tool requested by executor: ${toolCall.name}`);
    const invoke = tool.invoke.bind(tool) as (input: Record<string, unknown>) => Promise<unknown>;
    let serialized: string;
    try {
      serialized = serialize(await invoke(toolCall.args as Record<string, unknown>));
    } catch (error) {
      serialized = toolError(error);
    }
    return {
      plan: remaining,
      done: [[step, serialized] as [string, string]],
      trace: [action(toolCall.name, toolCall.args as Record<string, unknown>), observation(serialized)],
      iterations: state.iterations + 1,
      llmCalls: state.llmCalls + 1,
    };
  };

  const replanner = async (state: typeof PEState.State) => {
    if (!state.plan.length || state.iterations >= iterationLimit || state.iterations >= 8) {
      return {
        decision: "end" as const,
        answer: state.done.at(-1)?.[1] ?? "Plan execution completed.",
        trace: [answer(state.done.at(-1)?.[1] ?? "Plan execution completed.")],
      };
    }

    const result = await model.withStructuredOutput(replannerSchema).invoke([
      new SystemMessage(REPLANNER_PROMPT),
      new HumanMessage(JSON.stringify({ remaining: state.plan, done: state.done })),
    ]);
    const nextPlan = result.decision === "adjust" ? (result.steps ?? state.plan).slice(0, 8 - state.iterations) : state.plan;
    return {
      plan: nextPlan,
      decision: result.decision,
      trace: [critique(result.reason), ...(result.decision === "adjust" ? [planEvent(nextPlan.map((description, index) => ({ id: index + 1, description, status: "pending" as const })))] : [])],
      llmCalls: state.llmCalls + 1,
    };
  };

  const route = (state: typeof PEState.State): "executor" | typeof END =>
    state.decision === "end" || !state.plan.length || state.iterations >= iterationLimit || state.iterations >= 8 ? END : "executor";

  const executeRoute = (state: typeof PEState.State): "executor" | "replanner" | typeof END => {
    if (state.iterations >= iterationLimit || state.iterations >= 8 || !state.plan.length) return END;
    return useReplanner ? "replanner" : "executor";
  };

  return new StateGraph(PEState)
    .addNode("planner", planner)
    .addNode("executor", executor)
    .addNode("replanner", replanner)
    .addEdge(START, "planner")
    .addEdge("planner", "executor")
    .addConditionalEdges("executor", executeRoute, { executor: "executor", replanner: "replanner", [END]: END })
    .addConditionalEdges("replanner", route, { executor: "executor", [END]: END })
    .compile();
};

export const createPlanAndExecuteStrategy = (
  model = createOpenRouterModel(),
  tools = createTools(),
): ReasoningStrategy => ({
  name: "plan-and-execute",
  async run(input: ReasoningInput, options?: ReasoningOptions): Promise<ReasoningResult> {
    const startedAt = Date.now();
    const limit = maxIterations(options);
    const result = await createPlanGraph(model, tools, Math.min(limit, 8), options?.replanner !== false).invoke({ input });
    const trace = result.trace as TraceEvent[];
    const finalAnswer = result.answer || result.done.at(-1)?.[1] || "Plan execution completed.";
    if (!trace.some((event) => event.type === "answer")) trace.push(answer(finalAnswer));
    return {
      answer: finalAnswer,
      trace,
      metrics: { llmCalls: result.llmCalls, latencyMs: Math.max(0, Date.now() - startedAt) },
    };
  },
});
