import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { buildContext, type SectionBudget } from "../context/context-builder.js";
import { addOptionalPromptTokens, buildContextBreakdown, type ContextBreakdown } from "../context/tokens.js";
import type { RecalledMemory } from "../memory/memory-store.js";
import { DomainError } from "../store/ops-store.js";
import type { ConversationMessage } from "../store/conversation-store.js";
import { createOpenRouterModel } from "./model.js";
import { withReflection } from "./reflection.js";
import { answer as answerEvent, route as routeEvent, thought, withNode } from "./trace.js";
import type {
  Metrics,
  ReasoningResult,
  ReasoningStrategy,
  ReflectionOptions,
  RouteDecision,
  StrategyRoute,
  TraceEvent,
} from "./types.js";

export const PRODUCTION_ROUTES = ["react", "plan-and-execute", "reflect"] as const satisfies readonly StrategyRoute[];
export const ROUTER_FAILED = "ROUTER_FAILED";

export const routeDecisionSchema = z.object({
  route: z.enum(PRODUCTION_ROUTES),
  reason: z.string().trim().min(1),
});

export const isStrategyRoute = (value: string): value is StrategyRoute =>
  (PRODUCTION_ROUTES as readonly string[]).includes(value);

export class RouterError extends DomainError {
  constructor(message = "Router failed to choose a strategy") {
    super(message, ROUTER_FAILED);
  }
}

export type DecideRoute = (prompt: string) => Promise<RouteDecision>;

export type ProductionGraphInput = {
  message: string;
  history: ConversationMessage[];
  summary: string;
  memories: RecalledMemory[];
  budget: SectionBudget;
  override?: StrategyRoute;
  reflect?: boolean;
};

export type ProductionGraphResult = {
  answer: string;
  trace: TraceEvent[];
  metrics: Metrics;
  route: StrategyRoute;
  prompt: string;
  keptHistory: ConversationMessage[];
  keptMemories: RecalledMemory[];
};

export type ProductionGraphOptions = {
  strategies: {
    react: ReasoningStrategy;
    "plan-and-execute": ReasoningStrategy;
  };
  decideRoute?: DecideRoute;
  reflectionOptions?: ReflectionOptions;
  model?: ReturnType<typeof createOpenRouterModel>;
};

const ROUTER_PROMPT = `You are the OpsPilot router. Choose exactly one route using this table:

| route | when to use |
|-------|-------------|
| react | diagnostico iterativo com ferramentas |
| plan-and-execute | tarefa com varios passos sequenciais |
| reflect | conclusao operacional que precisa de critica extra |

Return only the structured route and one concise reason.`;

const GraphState = Annotation.Root({
  message: Annotation<string>(),
  history: Annotation<ConversationMessage[]>({ reducer: (_, value) => value, default: () => [] }),
  summary: Annotation<string>({ reducer: (_, value) => value, default: () => "" }),
  memories: Annotation<RecalledMemory[]>({ reducer: (_, value) => value, default: () => [] }),
  budget: Annotation<SectionBudget>(),
  override: Annotation<StrategyRoute | undefined>({ reducer: (_, value) => value, default: () => undefined }),
  reflectRequested: Annotation<boolean>({ reducer: (_, value) => value, default: () => false }),
  prompt: Annotation<string>({ reducer: (_, value) => value, default: () => "" }),
  keptHistory: Annotation<ConversationMessage[]>({ reducer: (_, value) => value, default: () => [] }),
  keptMemories: Annotation<RecalledMemory[]>({ reducer: (_, value) => value, default: () => [] }),
  contextBreakdown: Annotation<ContextBreakdown | undefined>({ reducer: (_, value) => value, default: () => undefined }),
  decision: Annotation<RouteDecision | undefined>({ reducer: (_, value) => value, default: () => undefined }),
  answer: Annotation<string>({ reducer: (_, value) => value, default: () => "" }),
  trace: Annotation<TraceEvent[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  llmCalls: Annotation<number>({ reducer: (left, right) => left + right, default: () => 0 }),
  promptTokens: Annotation<number | undefined>({
    reducer: (left, right) => addOptionalPromptTokens(left, right),
    default: () => undefined,
  }),
  startedAt: Annotation<number>({ reducer: (_, value) => value, default: () => Date.now() }),
  latencyMs: Annotation<number>({ reducer: (_, value) => value, default: () => 0 }),
});

export const createDefaultDecideRoute = (
  model = createOpenRouterModel(),
): DecideRoute => async (prompt: string): Promise<RouteDecision> => {
  const result = await model.withStructuredOutput(routeDecisionSchema).invoke([
    new SystemMessage(ROUTER_PROMPT),
    new HumanMessage(prompt),
  ]);
  const parsed = routeDecisionSchema.parse(result);
  return { ...parsed, source: "llm" };
};

const assertDecision = (decision: RouteDecision | undefined): RouteDecision => {
  if (!decision || !isStrategyRoute(decision.route) || !decision.reason.trim()) throw new RouterError();
  return decision;
};

const hasAnswer = (trace: readonly TraceEvent[]): boolean => trace.some((event) => event.type === "answer");

export const createProductionGraph = (options: ProductionGraphOptions) => {
  const decideRoute = options.decideRoute ?? createDefaultDecideRoute(options.model);

  const contextNode = async (state: typeof GraphState.State) => {
    const built = buildContext(
      {
        summary: state.summary,
        memories: state.memories,
        history: state.history,
        message: state.message,
      },
      state.budget,
    );
    const contextBreakdown = buildContextBreakdown({
      summary: built.sections.summary,
      memory: built.sections.memory,
      history: built.sections.history,
      message: built.sections.message,
    });
    return {
      prompt: built.prompt,
      keptHistory: built.keptHistory,
      keptMemories: built.keptMemories,
      contextBreakdown,
      trace: [thought("context built")].map((event) => ({ ...event, node: "context" as const })),
    };
  };

  const routerNode = async (state: typeof GraphState.State) => {
    try {
      const decision = state.override
        ? { route: state.override, reason: "client override", source: "override" as const }
        : await decideRoute(state.prompt);
      const parsed = assertDecision(decision);
      return {
        decision: parsed,
        trace: [routeEvent(parsed.route, parsed.reason)],
        llmCalls: parsed.source === "llm" ? 1 : 0,
      };
    } catch (error) {
      if (error instanceof RouterError) throw error;
      throw new RouterError();
    }
  };

  const runStrategy = (route: StrategyRoute) => async (state: typeof GraphState.State) => {
    const base = route === "plan-and-execute" ? options.strategies["plan-and-execute"] : options.strategies.react;
    const strategy = route === "reflect" || state.reflectRequested
      ? withReflection(base, options.reflectionOptions ?? {})
      : base;
    const result = await strategy.run(state.prompt);
    return {
      answer: result.answer,
      trace: withNode(result.trace, route),
      llmCalls: result.metrics.llmCalls,
      promptTokens: result.metrics.promptTokens,
    };
  };

  const responseNode = async (state: typeof GraphState.State) => {
    const finalAnswer = state.answer || "Execution ended without a final answer.";
    return {
      answer: finalAnswer,
      trace: hasAnswer(state.trace) ? [] : [{ ...answerEvent(finalAnswer), node: "response" as const }],
      latencyMs: Math.max(0, Date.now() - state.startedAt),
    };
  };

  const nextRoute = (state: typeof GraphState.State): StrategyRoute => assertDecision(state.decision).route;

  return new StateGraph(GraphState)
    .addNode("context", contextNode)
    .addNode("router", routerNode)
    .addNode("react", runStrategy("react"))
    .addNode("plan-and-execute", runStrategy("plan-and-execute"))
    .addNode("reflect", runStrategy("reflect"))
    .addNode("response", responseNode)
    .addEdge(START, "context")
    .addEdge("context", "router")
    .addConditionalEdges("router", nextRoute, {
      react: "react",
      "plan-and-execute": "plan-and-execute",
      reflect: "reflect",
    })
    .addEdge("react", "response")
    .addEdge("plan-and-execute", "response")
    .addEdge("reflect", "response")
    .addEdge("response", END)
    .compile();
};

export const runProductionGraph = async (
  graph: ReturnType<typeof createProductionGraph>,
  input: ProductionGraphInput,
): Promise<ProductionGraphResult> => {
  const { reflect, ...rest } = input;
  const result = await graph.invoke({ ...rest, reflectRequested: reflect ?? false, startedAt: Date.now() });
  const decision = assertDecision(result.decision);
  return {
    answer: result.answer,
    trace: result.trace,
    route: decision.route,
    prompt: result.prompt,
    keptHistory: result.keptHistory,
    keptMemories: result.keptMemories,
    metrics: {
      llmCalls: result.llmCalls,
      latencyMs: result.latencyMs,
      historyMessages: result.keptHistory.length,
      memoryFacts: result.keptMemories.length,
      learningQueued: false,
      ...(result.contextBreakdown ? { contextBreakdown: result.contextBreakdown } : {}),
      ...(result.promptTokens !== undefined ? { promptTokens: result.promptTokens } : {}),
    },
  };
};
