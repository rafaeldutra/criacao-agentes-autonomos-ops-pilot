import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { getApprovalContext } from "../approvals/approval-gate.js";
import { addOptionalPromptTokens } from "../context/tokens.js";
import { createOpenRouterModel, ModelUnavailableError, type ResilientModel } from "../agents/model.js";
import { fallbackEvents, RouterError } from "../agents/production-graph.js";
import { createReactStrategy } from "../agents/react.js";
import { metricsFromMessages } from "../agents/strategy.js";
import { createTools, type AgentTools } from "../agents/tools.js";
import { answer as answerEvent, handoff, observation, withNode } from "../agents/trace.js";
import type { ReasoningResult, ReasoningStrategy, TeamRole, TeamTarget, TraceEvent } from "../agents/types.js";
import { appendEntry, blackboardAsText, type BlackboardEntry } from "./blackboard.js";
import { ROLE_LABELS, ROLE_PROMPTS, toolsForRole } from "./roles.js";
import {
  assertSupervisorDecision,
  createDefaultDecideNext,
  mustFinish,
  TEAM_MAX_DECISIONS,
  type DecideNext,
} from "./supervisor.js";

/** Runs one specialist turn with exactly the tools of its role (none for the planner). */
export type SpecialistRunner = (
  role: TeamRole,
  input: { prompt: string; tools: Partial<AgentTools> },
) => Promise<ReasoningResult>;

export type TeamOptions = {
  decideNext?: DecideNext;
  runSpecialist?: SpecialistRunner;
};

const NO_ANSWER = "Execution ended without a final answer.";
const GATED_OBSERVATION = /^\s*(APPROVAL_REQUIRED|DENIED)\b/;

const TeamState = Annotation.Root({
  request: Annotation<string>(),
  entries: Annotation<BlackboardEntry[]>({ reducer: (_, value) => value, default: () => [] }),
  decisions: Annotation<number>({ reducer: (_, value) => value, default: () => 0 }),
  next: Annotation<TeamTarget>({ reducer: (_, value) => value, default: () => "done" }),
  brief: Annotation<string>({ reducer: (_, value) => value, default: () => "" }),
  answer: Annotation<string>({ reducer: (_, value) => value, default: () => "" }),
  trace: Annotation<TraceEvent[]>({ reducer: (left, right) => left.concat(right), default: () => [] }),
  llmCalls: Annotation<number>({ reducer: (left, right) => left + right, default: () => 0 }),
  promptTokens: Annotation<number | undefined>({
    reducer: (left, right) => addOptionalPromptTokens(left, right),
    default: () => undefined,
  }),
});

const text = (content: unknown): string => (typeof content === "string" ? content : JSON.stringify(content));
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const runPlanner = async (model: ResilientModel, prompt: string): Promise<ReasoningResult> => {
  const startedAt = Date.now();
  // No bindTools: the planner has no way to reach the store.
  const response = await model.invoke([new SystemMessage(ROLE_PROMPTS.planejador), new HumanMessage(prompt)]);
  const content = text(response.content);
  return { answer: content, trace: [answerEvent(content)], metrics: metricsFromMessages(startedAt, [response]) };
};

export const createDefaultSpecialistRunner = (model: ResilientModel): SpecialistRunner => async (role, input) =>
  role === "planejador"
    ? runPlanner(model, input.prompt)
    : createReactStrategy(model, input.tools).run(`${ROLE_PROMPTS[role]}\n\n${input.prompt}`);

/** What the specialist leaves on the board: its answer plus any held/denied sensitive call. */
const contributionOf = (result: ReasoningResult): string => {
  const gated = result.trace
    .filter((event) => event.type === "observation" && GATED_OBSERVATION.test(event.content))
    .map((event) => (event.type === "observation" ? event.content : ""))
    .filter((content) => !result.answer.includes(content));
  return [...gated, result.answer].join("\n");
};

export const createTeamGraph = (model: ResilientModel, tools: AgentTools, options: TeamOptions = {}) => {
  const decideNext = options.decideNext ?? createDefaultDecideNext(model);
  const runSpecialist = options.runSpecialist ?? createDefaultSpecialistRunner(model);

  const supervisor = async (state: typeof TeamState.State) => {
    const finish = mustFinish({
      decisions: state.decisions,
      approvalPending: getApprovalContext()?.pending !== undefined,
    });
    let verdict;
    try {
      verdict = assertSupervisorDecision(
        await decideNext({
          blackboard: blackboardAsText(state.request, state.entries),
          forceFinish: finish.force,
          ...(finish.reason ? { reason: finish.reason } : {}),
        }),
        finish.force,
      );
    } catch (error) {
      if (error instanceof RouterError || error instanceof ModelUnavailableError) throw error;
      throw new RouterError("Team supervisor failed to decide");
    }
    return {
      next: verdict.next,
      brief: verdict.brief,
      decisions: state.decisions + 1,
      ...(verdict.next === "done" ? { answer: verdict.brief } : {}),
      trace: [...fallbackEvents("supervisor"), handoff(verdict.next, verdict.brief, finish.reason === "limit")],
      llmCalls: 1,
    };
  };

  const specialist = (role: TeamRole) => async (state: typeof TeamState.State) => {
    const prompt = `Instrução do supervisor:\n${state.brief}\n\n${blackboardAsText(state.request, state.entries)}`;
    try {
      const result = await runSpecialist(role, { prompt, tools: toolsForRole(tools, role) });
      return {
        entries: appendEntry(state.entries, role, state.brief, contributionOf(result)),
        trace: [...fallbackEvents(role), ...withNode(result.trace, role)],
        llmCalls: result.metrics.llmCalls,
        promptTokens: result.metrics.promptTokens,
      };
    } catch (error) {
      if (error instanceof ModelUnavailableError) throw error;
      const failure = `${ROLE_LABELS[role]} falhou: ${errorText(error)}`;
      return {
        entries: appendEntry(state.entries, role, state.brief, failure, true),
        trace: [...fallbackEvents(role), { ...observation(failure), node: role }],
      };
    }
  };

  return new StateGraph(TeamState)
    .addNode("supervisor", supervisor)
    .addNode("analista", specialist("analista"))
    .addNode("planejador", specialist("planejador"))
    .addNode("executor", specialist("executor"))
    .addEdge(START, "supervisor")
    .addConditionalEdges("supervisor", (state) => state.next, {
      analista: "analista",
      planejador: "planejador",
      executor: "executor",
      done: END,
    })
    .addEdge("analista", "supervisor")
    .addEdge("planejador", "supervisor")
    .addEdge("executor", "supervisor")
    .compile();
};

export const createTeamStrategy = (
  model: ResilientModel = createOpenRouterModel(),
  tools: AgentTools = createTools(),
  options: TeamOptions = {},
): ReasoningStrategy => {
  const graph = createTeamGraph(model, tools, options);
  return {
    name: "team",
    async run(input: string): Promise<ReasoningResult> {
      const startedAt = Date.now();
      // Each decision is at most two steps (supervisor + specialist); the ceiling lives in mustFinish.
      const state = await graph.invoke({ request: input }, { recursionLimit: TEAM_MAX_DECISIONS * 2 + 2 });
      const finalAnswer = state.answer || NO_ANSWER;
      return {
        answer: finalAnswer,
        trace: [...state.trace, answerEvent(finalAnswer)],
        metrics: {
          llmCalls: state.llmCalls,
          latencyMs: Math.max(0, Date.now() - startedAt),
          historyMessages: 0,
          memoryFacts: 0,
          learningQueued: false,
          ...(state.promptTokens !== undefined ? { promptTokens: state.promptTokens } : {}),
        },
      };
    },
  };
};
