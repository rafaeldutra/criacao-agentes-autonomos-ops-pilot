import type { BaseMessage } from "@langchain/core/messages";
import type { Metrics, ReasoningOptions } from "./types.js";

export const maxIterations = (options?: ReasoningOptions): number => {
  const value = options?.maxIterations ?? 8;
  if (!Number.isInteger(value) || value < 1) throw new Error("maxIterations must be a positive integer");
  return value;
};

export const metricsFromMessages = (startedAt: number, messages: readonly BaseMessage[]): Metrics => ({
  llmCalls: messages.filter((message) => message.getType() === "ai").length,
  latencyMs: Math.max(0, Date.now() - startedAt),
});
