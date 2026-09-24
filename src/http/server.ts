import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { resolveStrategy, type AgentRegistry } from "../agents/index.js";
import type { ReflectionOptions } from "../agents/types.js";
import {
  scheduleLearning,
  type LearningReflector,
} from "../memory/learning-reflector.js";
import { formatMemoryBlock } from "../memory/memory-prompt.js";
import type { MemoryStore } from "../memory/memory-store.js";
import { FakeMemoryStore } from "../memory/fake-memory-store.js";
import {
  CONVERSATION_NOT_FOUND,
  DomainError,
  type ConversationStore,
} from "../store/conversation-store.js";
import { FakeConversationStore } from "../store/fake-conversation-store.js";
import { HISTORY_WINDOW, composeStrategyInput } from "./chat-history.js";
import { runWithUserId } from "./request-context.js";

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
};

type StrategyRunResult = {
  answer: string;
  trace: unknown;
  metrics: {
    llmCalls: number;
    latencyMs: number;
    historyMessages: number;
    memoryFacts: number;
    learningQueued: boolean;
  };
};

const isTimeout = (error: unknown): error is Error => error instanceof Error && error.message === "CHAT_TIMEOUT";

const isConversationNotFound = (error: unknown): error is DomainError =>
  error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND;

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

/** Composition: optional recall → history window → append → run → append → metrics. */
const runChat = async (
  conversations: ConversationStore,
  memories: MemoryStore,
  strategy: { run: (input: string) => Promise<StrategyRunResult> },
  input: { message: string; conversationId?: string; userId?: string },
) => {
  const conversationId = input.conversationId ?? conversations.create();
  if (input.conversationId && !conversations.exists(conversationId)) {
    throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
  }

  const history = conversations.lastMessages(conversationId, HISTORY_WINDOW);
  const facts = input.userId ? await memories.recall(input.userId, input.message) : [];
  const composed = `${formatMemoryBlock(facts)}${composeStrategyInput(history, input.message)}`;

  conversations.append(conversationId, "user", input.message);
  const result = await strategy.run(composed);
  conversations.append(conversationId, "assistant", result.answer);

  return {
    conversationId,
    ...result,
    metrics: {
      ...result.metrics,
      historyMessages: history.length,
      memoryFacts: facts.length,
      learningQueued: Boolean(input.userId),
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
) => async (request: Request, response: Response) => {
  const parsed = chatRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ issues: parsed.error.issues });
    return;
  }

  const strategyName = parsed.data.strategy ?? "react";
  const strategy = resolveStrategy(registry, strategyName, parsed.data.reflect, reflectionOptions);
  if (!strategy) {
    response.status(422).json({ error: `Unknown strategy: ${strategyName}` });
    return;
  }

  const userId = parsed.data.userId;

  try {
    const result = await runWithUserId(userId, () =>
      runWithTimeout(
        runChat(conversations, memories, strategy, {
          message: parsed.data.message,
          conversationId: parsed.data.conversationId,
          userId,
        }),
        timeoutMs,
      ),
    );
    response.status(200).json(result);

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
      response.status(504).json({ error: "Chat execution timed out" });
      return;
    }
    if (isConversationNotFound(error)) {
      response.status(404).json({ error: error.message, code: error.code });
      return;
    }
    throw error;
  }
};

export const createApp = (registry: AgentRegistry, options: ChatServerOptions = {}): Express => {
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive");
  const conversations = options.conversations ?? new FakeConversationStore();
  const memories = options.memories ?? new FakeMemoryStore({ embed: async () => new Float32Array(384) });

  const app = express();
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
    ),
  );
  return app;
};

export { CHAT_TIMEOUT_MS, HISTORY_WINDOW, runChat };
