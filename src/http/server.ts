import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { resolveStrategy, type AgentRegistry } from "../agents/index.js";
import type { ReflectionOptions } from "../agents/types.js";

const CHAT_TIMEOUT_MS = 180_000;

const chatRequestSchema = z.object({
  message: z.string().trim().min(1),
  strategy: z.string().trim().min(1).optional(),
  reflect: z.boolean().optional().default(false),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatServerOptions = {
  timeoutMs?: number;
  reflectionOptions?: ReflectionOptions;
};

const isTimeout = (error: unknown): error is Error => error instanceof Error && error.message === "CHAT_TIMEOUT";

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

const chatHandler = (
  registry: AgentRegistry,
  timeoutMs: number,
  reflectionOptions: ReflectionOptions,
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

  try {
    const result = await runWithTimeout(strategy.run(parsed.data.message), timeoutMs);
    response.status(200).json(result);
  } catch (error) {
    if (isTimeout(error)) {
      response.status(504).json({ error: "Chat execution timed out" });
      return;
    }
    throw error;
  }
};

export const createApp = (registry: AgentRegistry, options: ChatServerOptions = {}): Express => {
  const timeoutMs = options.timeoutMs ?? CHAT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive");

  const app = express();
  app.use(express.json());
  app.post("/chat", chatHandler(registry, timeoutMs, options.reflectionOptions ?? {}));
  return app;
};

export { CHAT_TIMEOUT_MS };
