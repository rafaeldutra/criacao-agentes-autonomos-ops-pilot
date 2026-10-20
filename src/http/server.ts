import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { type AgentRegistry } from "../agents/index.js";
import {
  createProductionGraph,
  isStrategyRoute,
  ROUTER_FAILED,
  runProductionGraph,
  type DecideRoute,
} from "../agents/production-graph.js";
import { ModelUnavailableError } from "../agents/model.js";
import type { ReflectionOptions, TraceEvent } from "../agents/types.js";
import {
  createFakeHistorySummarizer,
  maybeSummarizeAfterTurn,
  type HistorySummarizer,
} from "../conversation/history-summarizer.js";
import {
  loadSectionBudgets,
  type SectionBudget,
} from "../context/context-builder.js";
import {
  scheduleLearning,
  type LearningReflector,
} from "../memory/learning-reflector.js";
import type { MemoryStore } from "../memory/memory-store.js";
import { FakeMemoryStore } from "../memory/fake-memory-store.js";
import {
  CONVERSATION_NOT_FOUND,
  DomainError,
  type ConversationStore,
} from "../store/conversation-store.js";
import { FakeConversationStore } from "../store/fake-conversation-store.js";
import { FakeRequestStore } from "../store/fake-request-store.js";
import type { RequestStore } from "../store/request-store.js";
import { createLogger, errorMeta, type Logger } from "../obs/logger.js";
import { loadModelPrices, type ModelPrices } from "../obs/stats.js";
import { HISTORY_WINDOW } from "./chat-history.js";
import { corsMiddleware, parseCorsOrigins } from "./cors.js";
import { decisionHandler, getApprovalHandler } from "./approvals.js";
import {
  createApprovalContext,
  runWithApprovalContext,
  type Grant,
  type PendingCall,
} from "../approvals/approval-gate.js";
import { createApprovalService, resolveReason, type ApprovalService } from "../approvals/approval-service.js";
import {
  APPROVAL_PENDING,
  expiryCutoff,
  loadApprovalTtlMinutes,
  toApprovalView,
  type Approval,
  type ApprovalStore,
  type ApprovalView,
} from "../store/approval-store.js";
import { FakeApprovalStore } from "../store/fake-approval-store.js";
import { runWithUserId } from "./request-context.js";
import {
  chatAuditMiddleware,
  getChatOutcome,
  getRequestHandler,
  getRequestId,
  getStatsHandler,
  requestIdMiddleware,
  setChatOutcome,
  withRequestId,
  type ChatOutcome,
} from "./request-trace.js";

const CHAT_TIMEOUT_MS = 180_000;

const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  strategy: z.string().trim().min(1).optional(),
  reflect: z.boolean().optional().default(false),
  conversationId: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatServerOptions = {
  timeoutMs?: number;
  reflectionOptions?: ReflectionOptions;
  conversations?: ConversationStore;
  memories?: MemoryStore;
  learningReflector?: LearningReflector;
  historySummarizer?: HistorySummarizer;
  /** Injected budgets for tests; defaults to loadSectionBudgets(process.env). */
  sectionBudget?: SectionBudget;
  decideRoute?: DecideRoute;
  /** Persisted /chat records and traces; defaults to an in-memory fake. */
  requests?: RequestStore;
  /** Structured JSON logger; defaults to stdout/stderr. */
  logger?: Logger;
  /** USD per 1M prompt tokens for /stats; defaults to loadModelPrices(process.env). */
  modelPrices?: ModelPrices;
  /** Clock for /stats windows; injected by tests. */
  now?: () => Date;
  /** Browser origins allowed by CORS; defaults to parseCorsOrigins(process.env.OPSPILOT_CORS_ORIGINS). */
  corsOrigins?: readonly string[];
  /** Pending human approvals; defaults to an in-memory fake. */
  approvals?: ApprovalStore;
  /** Minutes an approval stays decidable; defaults to OPSPILOT_APPROVAL_TTL_MINUTES or 1440. */
  approvalTtlMinutes?: number;
  /** Runs an approved tool for real; called outside any approval context, so never gated. */
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

const isTimeout = (error: unknown): error is Error => error instanceof Error && error.message === "CHAT_TIMEOUT";

const isConversationNotFound = (error: unknown): error is DomainError =>
  error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND;

const isRouterFailed = (error: unknown): error is DomainError =>
  error instanceof DomainError && error.code === ROUTER_FAILED;

const isJsonParseError = (error: unknown): boolean =>
  error instanceof SyntaxError &&
  typeof error === "object" &&
  error !== null &&
  (error as { status?: unknown; type?: unknown }).status === 400 &&
  (error as { type?: unknown }).type === "entity.parse.failed";

const isProviderError = (error: unknown): boolean =>
  error instanceof Error && /Provider returned error|APIError/i.test(error.message);

const runWithTimeout = async <T>(task: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CHAT_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const asTrace = (trace: unknown): TraceEvent[] =>
  Array.isArray(trace) ? (trace as TraceEvent[]) : [];

/** Composition: recall -> append -> production graph -> append -> maybe summarize. */
const runChat = async (
  conversations: ConversationStore,
  memories: MemoryStore,
  registry: AgentRegistry,
  input: { message: string; conversationId?: string; userId?: string },
  graphOptions: {
    override?: string;
    reflect: boolean;
    reflectionOptions: ReflectionOptions;
    decideRoute?: DecideRoute;
  },
  historySummarizer?: HistorySummarizer,
  sectionBudget?: SectionBudget,
  log: { logger: Logger; requestId?: string } = { logger: createLogger() },
) => {
  const conversationId = input.conversationId ?? conversations.create();
  if (input.conversationId && !conversations.exists(conversationId)) {
    throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
  }

  const history = conversations.lastMessages(conversationId, HISTORY_WINDOW);
  const summaryRecord = conversations.getSummary(conversationId);
  const facts = input.userId ? await memories.recall(input.userId, input.message) : [];
  const budget = sectionBudget ?? loadSectionBudgets(process.env);

  conversations.append(conversationId, "user", input.message);
  const graph = createProductionGraph({
    strategies: {
      react: registry.react,
      "plan-and-execute": registry["plan-and-execute"] ?? registry.react,
      ...(registry.team ? { team: registry.team } : {}),
    },
    decideRoute: graphOptions.decideRoute,
    reflectionOptions: graphOptions.reflectionOptions,
  });
  const result = await runProductionGraph(graph, {
    message: input.message,
    history,
    summary: summaryRecord?.summary ?? "",
    memories: facts,
    budget,
    override: graphOptions.override && isStrategyRoute(graphOptions.override) ? graphOptions.override : undefined,
    reflect: graphOptions.reflect,
  });
  conversations.append(conversationId, "assistant", result.answer);

  let trace = asTrace(result.trace);
  if (historySummarizer) {
    const summarized = await maybeSummarizeAfterTurn({
      conversations,
      conversationId,
      summarizer: historySummarizer,
      onError: (error) => {
        log.logger.error("history_summary.failed", {
          requestId: log.requestId,
          conversationId,
          ...errorMeta(error),
        });
      },
    });
    if (summarized) {
      trace = [...trace, { ...summarized.event, node: "response" as const }];
    }
  }

  const { promptTokens, ...baseMetrics } = result.metrics;

  return {
    conversationId,
    ...result,
    trace,
    metrics: {
      ...baseMetrics,
      historyMessages: result.metrics.historyMessages,
      memoryFacts: result.metrics.memoryFacts,
      learningQueued: Boolean(input.userId),
      ...(typeof promptTokens === "number" ? { promptTokens } : {}),
    },
  };
};

type ChatResult = Awaited<ReturnType<typeof runChat>>;

export type TurnInput = {
  message: string;
  conversationId?: string;
  userId?: string;
  strategy?: string;
  reflect: boolean;
};

/** One agent turn; `pending` is set when the turn stopped at a sensitive tool. */
export type TurnOutcome = { result: ChatResult; pending?: PendingCall };

type Reply = (status: number, body: object, outcome?: ChatOutcome) => void;

type ChatDeps = {
  registry: AgentRegistry;
  timeoutMs: number;
  reflectionOptions: ReflectionOptions;
  conversations: ConversationStore;
  memories: MemoryStore;
  learningReflector?: LearningReflector;
  historySummarizer?: HistorySummarizer;
  sectionBudget?: SectionBudget;
  decideRoute?: DecideRoute;
  logger: Logger;
  approvals: ApprovalStore;
  approvalService: ApprovalService;
};

/** Runs runChat inside an approval context holding `grants` (empty for a fresh /chat turn). */
const runTurn = async (deps: ChatDeps, input: TurnInput, grants: Grant[], requestId: string): Promise<TurnOutcome> => {
  const context = createApprovalContext(grants);
  const result = await runWithApprovalContext(context, () =>
    runWithUserId(input.userId, () =>
      runWithTimeout(
        runChat(
          deps.conversations,
          deps.memories,
          deps.registry,
          { message: input.message, conversationId: input.conversationId, userId: input.userId },
          {
            override: input.strategy,
            reflect: input.reflect,
            reflectionOptions: deps.reflectionOptions,
            decideRoute: deps.decideRoute,
          },
          deps.historySummarizer,
          deps.sectionBudget,
          { logger: deps.logger, requestId },
        ),
        deps.timeoutMs,
      ),
    ),
  );
  return { result, pending: context.pending };
};

const approvalView = (deps: ChatDeps, approval: Approval): ApprovalView =>
  toApprovalView(approval, deps.approvalService.now(), deps.approvalService.ttlMinutes);

/**
 * 200 with the answer, or 202 when the turn stopped at a sensitive tool (the approval is
 * persisted here). `decided` is the approval that a decision request just resolved.
 */
const replyTurn = (
  deps: ChatDeps,
  reply: Reply,
  turn: TurnOutcome,
  context: { requestId: string; originalMessage: string; userId?: string; decided?: ApprovalView },
): "final" | "pending" => {
  const { result, pending } = turn;
  const outcome: ChatOutcome = {
    conversationId: result.conversationId,
    route: result.route,
    metrics: result.metrics,
    trace: result.trace,
  };
  if (!pending) {
    reply(200, context.decided ? { ...result, approval: context.decided } : result, outcome);
    return "final";
  }
  const approval = deps.approvalService.createPending({
    conversationId: result.conversationId,
    requestId: context.requestId,
    userId: context.userId,
    pending,
    reason: resolveReason(pending, result.trace),
    originalMessage: context.originalMessage,
  });
  reply(
    202,
    {
      ...result,
      status: "pending_approval",
      approval: approvalView(deps, approval),
      ...(context.decided ? { decided: context.decided } : {}),
    },
    { ...outcome, approvalId: approval.id },
  );
  return "pending";
};

/** Maps the known turn failures to HTTP; false means "not mine, rethrow". */
const replyTurnError = (reply: Reply, error: unknown): boolean => {
  if (isTimeout(error)) {
    reply(504, { error: "Chat execution timed out" }, { errorCode: "CHAT_TIMEOUT" });
    return true;
  }
  if (isConversationNotFound(error)) {
    reply(404, { error: error.message, code: error.code }, { errorCode: error.code });
    return true;
  }
  if (isRouterFailed(error)) {
    reply(502, { error: error.message, code: error.code }, { errorCode: error.code });
    return true;
  }
  if (error instanceof ModelUnavailableError) {
    reply(503, { error: error.message, code: error.code }, { errorCode: error.code });
    return true;
  }
  return false;
};

const replyFor = (response: Response, requestId: string): Reply => (status, body, outcome = {}) => {
  setChatOutcome(response, outcome);
  response.status(status).json(withRequestId(requestId, body));
};

const chatHandler = (deps: ChatDeps) => async (request: Request, response: Response) => {
  const requestId = getRequestId(response);
  const reply = replyFor(response, requestId);

  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    reply(400, { issues: parsed.error.issues }, { errorCode: "VALIDATION_ERROR" });
    return;
  }
  setChatOutcome(response, {
    conversationId: parsed.data.conversationId,
    userId: parsed.data.userId,
    reflect: parsed.data.reflect,
  });

  if (!deps.registry.react) {
    reply(422, { error: "Unknown strategy: react" }, { errorCode: "UNKNOWN_STRATEGY" });
    return;
  }
  if (parsed.data.strategy && !isStrategyRoute(parsed.data.strategy)) {
    reply(422, { error: `Unknown strategy: ${parsed.data.strategy}` }, { errorCode: "UNKNOWN_STRATEGY" });
    return;
  }

  if (parsed.data.conversationId) {
    const waiting = deps.approvals.findPending(
      parsed.data.conversationId,
      expiryCutoff(deps.approvalService.now(), deps.approvalService.ttlMinutes),
    );
    if (waiting) {
      reply(
        409,
        { error: "Conversation has a pending approval", code: APPROVAL_PENDING, approvalId: waiting.id },
        { errorCode: APPROVAL_PENDING },
      );
      return;
    }
  }

  const userId = parsed.data.userId;

  try {
    const turn = await runTurn(deps, parsed.data, [], requestId);
    const kind = replyTurn(deps, reply, turn, { requestId, originalMessage: parsed.data.message, userId });

    if (kind === "final" && userId && deps.learningReflector) {
      scheduleLearning({
        userId,
        userMessage: parsed.data.message,
        memories: deps.memories,
        reflect: deps.learningReflector,
      });
    }
  } catch (error) {
    if (replyTurnError(reply, error)) return;
    throw error;
  }
};

/** Global handler; only /chat bodies carry requestId (other routes keep it in the header). */
const errorHandler = (logger: Logger) => (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (response.headersSent) return;
  const requestId = getRequestId(response);
  const isChat = getChatOutcome(response) !== undefined;
  const reply = (status: number, body: object, errorCode: string) => {
    setChatOutcome(response, { errorCode });
    response.status(status).json(isChat ? withRequestId(requestId, body) : body);
  };

  if (isJsonParseError(error)) {
    reply(400, { error: "Invalid JSON body" }, "INVALID_JSON");
    return;
  }
  if (isProviderError(error)) {
    reply(
      502,
      { error: error instanceof Error ? error.message : "Provider error", code: "PROVIDER_ERROR" },
      "PROVIDER_ERROR",
    );
    return;
  }
  logger.error("http.error", { requestId, ...errorMeta(error) });
  reply(500, { error: error instanceof Error ? error.message : "Internal server error" }, "INTERNAL_ERROR");
};

export const createApp = (registry: AgentRegistry, options: ChatServerOptions = {}): Express => {
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive");
  const conversations = options.conversations ?? new FakeConversationStore();
  const memories = options.memories ?? new FakeMemoryStore({ embed: async () => new Float32Array(384) });
  const requests = options.requests ?? new FakeRequestStore();
  const logger = options.logger ?? createLogger();
  const modelPrices = options.modelPrices ?? loadModelPrices(process.env);
  const corsOrigins = options.corsOrigins ?? parseCorsOrigins(process.env.OPSPILOT_CORS_ORIGINS);

  const app = express();
  app.use(requestIdMiddleware(logger));
  // Before the audit and body parser: preflights are neither persisted nor parsed.
  app.use(corsMiddleware(corsOrigins));
  app.use("/chat", chatAuditMiddleware(requests, logger));
  app.use(express.json());

  const approvals = options.approvals ?? new FakeApprovalStore();
  const approvalService = createApprovalService({
    approvals,
    executeTool: async ({ tool, args, userId }) => {
      const execute = options.executeTool;
      if (!execute) throw new Error("Approved tool execution is not configured");
      return runWithUserId(userId ?? undefined, () => execute(tool, args));
    },
    now: options.now,
    ttlMinutes: options.approvalTtlMinutes ?? loadApprovalTtlMinutes(process.env),
  });
  const deps: ChatDeps = {
    registry,
    timeoutMs,
    reflectionOptions: options.reflectionOptions ?? {},
    conversations,
    memories,
    learningReflector: options.learningReflector,
    historySummarizer: options.historySummarizer,
    sectionBudget: options.sectionBudget,
    decideRoute: options.decideRoute,
    logger,
    approvals,
    approvalService,
  };
  const view = (approval: Approval) => approvalView(deps, approval);

  app.post("/chat", chatHandler(deps));
  app.post(
    "/approvals/:id/decision",
    chatAuditMiddleware(requests, logger),
    decisionHandler({
      service: approvalService,
      view,
      reply: replyFor,
      runTurn: (approval, message, grants, requestId) =>
        runTurn(
          deps,
          { message, conversationId: approval.conversationId, userId: approval.userId ?? undefined, reflect: false },
          grants,
          requestId,
        ),
      replyTurn: (reply, turn, context) => replyTurn(deps, reply, turn, context),
      replyTurnError,
    }),
  );
  app.get("/approvals/:id", getApprovalHandler({ service: approvalService, view }));
  app.get("/requests/:id", getRequestHandler(requests));
  app.get("/stats", getStatsHandler(requests, modelPrices, options.now));
  app.use(errorHandler(logger));
  return app;
};

export { CHAT_TIMEOUT_MS, HISTORY_WINDOW, runChat, createFakeHistorySummarizer };
