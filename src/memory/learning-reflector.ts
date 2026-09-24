import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createOpenRouterModel } from "../agents/model.js";
import type { MemoryStore } from "./memory-store.js";

export type LearningVerdict = {
  hasLearning: boolean;
  fact: string;
};

export type LearningReflector = (userMessage: string) => Promise<LearningVerdict>;

export const learningVerdictSchema = z
  .object({
    hasLearning: z.boolean(),
    fact: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.hasLearning && value.fact.trim().length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "fact required when hasLearning is true",
        path: ["fact"],
      });
    }
  });

export const LEARNING_SYSTEM_PROMPT =
  "You distill durable user preferences/constraints from a single user message for long-term memory. " +
  "Set hasLearning=true only for stable preferences or standing constraints (e.g. language, notification style). " +
  "Never learn one-shot operational requests (list alerts, open incident, status checks). " +
  "Never learn secrets, credentials, tokens, passwords, API keys, or other sensitive values. " +
  "When unsure, set hasLearning=false and fact=\"\". " +
  "When hasLearning=true, write fact as a short stable third-person statement.";

/** Contract fixtures for deterministic stub tests. */
export const LEARNING_FIXTURES = {
  preference: "Sempre responda em português.",
  oneShot: "Liste os alertas firing agora.",
  secret: "Minha API key é sk-secret-123.",
} as const;

export const shouldRemember = (verdict: LearningVerdict): boolean =>
  verdict.hasLearning && verdict.fact.trim().length >= 1;

export type ScheduleLearningArgs = {
  userId: string;
  userMessage: string;
  memories: MemoryStore;
  reflect: LearningReflector;
  onError?: (error: unknown) => void;
};

/** Fire-and-forget: does not return a Promise to callers. */
export const scheduleLearning = (args: ScheduleLearningArgs): void => {
  const onError =
    args.onError ??
    ((error: unknown) => {
      console.error("[learning-reflector]", error);
    });

  void (async () => {
    const message = args.userMessage.trim();
    if (!message) return;

    const verdict = await args.reflect(message);
    if (!shouldRemember(verdict)) return;

    await args.memories.remember(args.userId, verdict.fact.trim());
  })().catch(onError);
};

export const createLearningReflector = (
  model: ReturnType<typeof createOpenRouterModel> = createOpenRouterModel(),
): LearningReflector => {
  const structured = model.withStructuredOutput(learningVerdictSchema);
  return async (userMessage: string): Promise<LearningVerdict> => {
    const result = await structured.invoke([
      new SystemMessage(LEARNING_SYSTEM_PROMPT),
      new HumanMessage(`User message:\n${userMessage}`),
    ]);
    return learningVerdictSchema.parse(result);
  };
};

/** Deterministic stub map for CI fixtures (preference / one-shot / secret). */
export const createFixtureLearningReflector = (): LearningReflector => async (userMessage) => {
  const text = userMessage.trim();
  if (text === LEARNING_FIXTURES.preference || /sempre responda em portugu[eê]s/i.test(text)) {
    return { hasLearning: true, fact: "User prefers responses in Portuguese." };
  }
  if (text === LEARNING_FIXTURES.oneShot || /liste os alertas/i.test(text)) {
    return { hasLearning: false, fact: "" };
  }
  if (text === LEARNING_FIXTURES.secret || /api key|sk-|password|token|senha/i.test(text)) {
    return { hasLearning: false, fact: "" };
  }
  return { hasLearning: false, fact: "" };
};
