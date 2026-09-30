import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";

export type ContextBreakdown = {
  memory: number;
  history: number;
  message: number;
  summary: number;
};

/** Rough token estimate: floor(chars / 4). Uses String.length (UTF-16 code units). */
export const estimateTokens = (text: string): number => Math.floor(text.length / 4);

/** Reads LangChain UsageMetadata.input_tokens when valid; otherwise undefined. */
export const promptTokensFromUsage = (usage: unknown): number | undefined => {
  if (usage === null || typeof usage !== "object") return undefined;
  const inputTokens = (usage as { input_tokens?: unknown }).input_tokens;
  if (typeof inputTokens !== "number" || !Number.isFinite(inputTokens) || inputTokens < 0) {
    return undefined;
  }
  return inputTokens;
};

/** Sums AI message usage_metadata.input_tokens; undefined if none had valid usage. */
export const sumPromptTokensFromMessages = (
  messages: readonly BaseMessage[],
): number | undefined => {
  let sum = 0;
  let found = false;
  for (const message of messages) {
    if (message.getType() !== "ai") continue;
    const usage = message instanceof AIMessage ? message.usage_metadata : undefined;
    const tokens = promptTokensFromUsage(usage);
    if (tokens === undefined) continue;
    found = true;
    sum += tokens;
  }
  return found ? sum : undefined;
};

export const buildContextBreakdown = (parts: {
  memory: string;
  history: string;
  message: string;
  summary?: string;
}): ContextBreakdown => ({
  memory: estimateTokens(parts.memory),
  history: estimateTokens(parts.history),
  message: estimateTokens(parts.message),
  summary: estimateTokens(parts.summary ?? ""),
});

/** Adds optional prompt token totals; undefined only when both sides are undefined. */
export const addOptionalPromptTokens = (a?: number, b?: number): number | undefined => {
  if (a === undefined && b === undefined) return undefined;
  return (a ?? 0) + (b ?? 0);
};
