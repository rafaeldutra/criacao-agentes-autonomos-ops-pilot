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

const chatHandler = (
  registry: AgentRegistry,
  timeoutMs: number,
  reflectionOptions: ReflectionOptions,
  conversations: ConversationStore,
  memories: MemoryStore,
  learningReflector: LearningReflector | undefined,
  historySummarizer: HistorySummarizer | undefined,
  sectionBudget: SectionBudget | undefined,
  decideRoute: DecideRoute | undefined,
  logger: Logger,
) => async (request: Request, response: Response) => {
  const requestId = getRequestId(response);
  const reply = (status: number, body: object, outcome: ChatOutcome = {}) => {
    setChatOutcome(response, outcome);
    response.status(status).json(withRequestId(requestId, body));
  };

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

  if (!registry.react) {
    reply(422, { error: "Unknown strategy: react" }, { errorCode: "UNKNOWN_STRATEGY" });
    return;
  }
  if (parsed.data.strategy && !isStrategyRoute(parsed.data.strategy)) {
    reply(422, { error: `Unknown strategy: ${parsed.data.strategy}` }, { errorCode: "UNKNOWN_STRATEGY" });
    return;
  }

  const userId = parsed.data.userId;

  try {
    const result = await runWithUserId(userId, () =>
      runWithTimeout(
        runChat(
          conversations,
          memories,
          registry,
          {
            message: parsed.data.message,
            conversationId: parsed.data.conversationId,
            userId,
          },
          {
            override: parsed.data.strategy,
            reflect: parsed.data.reflect,
            reflectionOptions,
            decideRoute,
          },
          historySummarizer,
          sectionBudget,
          { logger, requestId },
        ),
        timeoutMs,
      ),
    );
    reply(200, result, {
      conversationId: result.conversationId,
      route: result.route,
      metrics: result.metrics,
      trace: result.trace,
    });

    if (userId && learningReflector) {
      scheduleLearning({
        userId,
        userMessage: parsed.data.message,
        memories,
        reflect: learningReflector,
      });
    }
  } catch (error) {
    if (isTimeout(error)) {
      reply(504, { error: "Chat execution timed out" }, { errorCode: "CHAT_TIMEOUT" });
      return;
    }
    if (isConversationNotFound(error)) {
      reply(404, { error: error.message, code: error.code }, { errorCode: error.code });
      return;
    }
    if (isRouterFailed(error)) {
      reply(502, { error: error.message, code: error.code }, { errorCode: error.code });
      return;
    }
    if (error instanceof ModelUnavailableError) {
      reply(503, { error: error.message, code: error.code }, { errorCode: error.code });
      return;
    }
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

  const app = express();
  app.use(requestIdMiddleware(logger));
  app.use("/chat", chatAuditMiddleware(requests, logger));
  app.use(express.json());
  app.post(
    "/chat",
    chatHandler(
      registry,
      timeoutMs,
      options.reflectionOptions ?? {},
      conversations,
      memories,
      options.learningReflector,
      options.historySummarizer,
      options.sectionBudget,
      options.decideRoute,
      logger,
    ),
  );
  app.get("/requests/:id", getRequestHandler(requests));
  app.get("/stats", getStatsHandler(requests, modelPrices, options.now));
  app.use(errorHandler(logger));
  return app;
};

export { CHAT_TIMEOUT_MS, HISTORY_WINDOW, runChat, createFakeHistorySummarizer };
