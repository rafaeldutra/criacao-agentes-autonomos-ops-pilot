import type { BaseLanguageModelInput, StructuredOutputMethodOptions } from "@langchain/core/language_models/base";
import type { BindToolsInput } from "@langchain/core/language_models/chat_models";
import type { AIMessageChunk } from "@langchain/core/messages";
import { RunnableLambda, type Runnable, type RunnableConfig } from "@langchain/core/runnables";
import type { ZodV4Like } from "@langchain/core/utils/types";
import { ChatOpenAI } from "@langchain/openai";

import { DomainError } from "../store/ops-store.js";
import { recordFallback, recordModelUsed } from "./model-usage.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
/** Primary attempts in total: 1 call + 2 retries. */
const DEFAULT_ATTEMPTS = 3;
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404, 422]);
const MAX_REASON_LENGTH = 200;

export const MODEL_SERVICE_UNAVAILABLE = "MODEL_SERVICE_UNAVAILABLE";

/** Primary and fallback both failed; mapped to HTTP 503. `cause` stays server-side. */
export class ModelUnavailableError extends DomainError {
  constructor(options: { cause?: unknown } = {}) {
    super("Language model service unavailable", MODEL_SERVICE_UNAVAILABLE);
    this.name = "ModelUnavailableError";
    if ("cause" in options) this.cause = options.cause;
  }
}

const statusOf =(error: unknown): number | undefined => {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status : undefined;
};

/** Transient failures (429, 5xx, network, unknown) are retried; client errors are not. */
export const isRetryableModelError = (error: unknown): boolean => {
  const status = statusOf(error);
  return status === undefined || !NON_RETRYABLE_STATUS.has(status);
};

/** `<status> <first message line>`, capped, never a stack trace. */
export const fallbackReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split("\n")[0]?.trim() || "unknown error";
  const status = statusOf(error);
  return (status === undefined ? firstLine : `${status} ${firstLine}`).slice(0, MAX_REASON_LENGTH);
};

/** Minimal chat model surface the resilient chain needs; ChatOpenAI satisfies it. */
export type ChatModelSource = {
  invoke(input: BaseLanguageModelInput, options?: RunnableConfig): Promise<AIMessageChunk>;
  bindTools?(tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk>;
  withStructuredOutput<T extends Record<string, any>>(
    schema: ZodV4Like<T> | Record<string, any>,
    config?: StructuredOutputMethodOptions<false>,
  ): Runnable<BaseLanguageModelInput, T>;
};

export type ResilientModel = {
  readonly primaryModel: string;
  readonly fallbackModel: string;
  invoke(input: BaseLanguageModelInput, options?: RunnableConfig): Promise<AIMessageChunk>;
  bindTools(tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk>;
  withStructuredOutput<T extends Record<string, any> = Record<string, any>>(
    schema: ZodV4Like<T> | Record<string, any>,
    config?: StructuredOutputMethodOptions<false>,
  ): Runnable<BaseLanguageModelInput, T>;
};

export type ResilientModelOptions = {
  primary: ChatModelSource;
  fallback: ChatModelSource;
  primaryModel: string;
  fallbackModel: string;
  retry?: { stopAfterAttempt?: number };
};

type Call<T> = (input: BaseLanguageModelInput, config?: RunnableConfig) => Promise<T>;

const asCall = <T>(runnable: Runnable<BaseLanguageModelInput, T>): Call<T> =>
  (input, config) => runnable.invoke(input, config);

const bindToolsOf = (model: ChatModelSource, tools: BindToolsInput[]) => {
  if (!model.bindTools) throw new Error("Chat model does not support tool binding");
  return model.bindTools(tools);
};

export const createResilientModel = (options: ResilientModelOptions): ResilientModel => {
  const stopAfterAttempt = options.retry?.stopAfterAttempt ?? DEFAULT_ATTEMPTS;
  if (!Number.isInteger(stopAfterAttempt) || stopAfterAttempt < 1) {
    throw new Error("retry.stopAfterAttempt must be a positive integer");
  }

  // The chain is built per invocation so the primary error used as fallback reason never leaks across calls.
  const resilient = <T>(primary: Call<T>, fallback: Call<T>): Runnable<BaseLanguageModelInput, T> =>
    RunnableLambda.from(async (input: BaseLanguageModelInput, config?: RunnableConfig) => {
      let primaryError: unknown;
      const primaryWithRetry = RunnableLambda.from(async (value: BaseLanguageModelInput, runConfig?: RunnableConfig) => {
        try {
          const output = await primary(value, runConfig);
          recordModelUsed(options.primaryModel);
          return output;
        } catch (error) {
          primaryError = error;
          throw error;
        }
      }).withRetry({
        stopAfterAttempt,
        onFailedAttempt: (error) => {
          // Throwing here stops p-retry and hands over to the fallback.
          if (!isRetryableModelError(error)) throw error;
        },
      });
      const fallbackOnce = RunnableLambda.from(async (value: BaseLanguageModelInput, runConfig?: RunnableConfig) => {
        const output = await fallback(value, runConfig);
        recordFallback({
          fromModel: options.primaryModel,
          toModel: options.fallbackModel,
          reason: fallbackReason(primaryError),
        });
        recordModelUsed(options.fallbackModel);
        return output;
      });
      try {
        return await primaryWithRetry.withFallbacks([fallbackOnce]).invoke(input, config);
      } catch (error) {
        // withFallbacks rethrows the primary's error once the fallback also fails.
        throw new ModelUnavailableError({ cause: error });
      }
    });

  return {
    primaryModel: options.primaryModel,
    fallbackModel: options.fallbackModel,
    invoke: (input, config) =>
      resilient(
        (value, runConfig) => options.primary.invoke(value, runConfig),
        (value, runConfig) => options.fallback.invoke(value, runConfig),
      ).invoke(input, config),
    bindTools: (tools) =>
      resilient(asCall(bindToolsOf(options.primary, tools)), asCall(bindToolsOf(options.fallback, tools))),
    withStructuredOutput: <T extends Record<string, any> = Record<string, any>>(
      schema: ZodV4Like<T> | Record<string, any>,
      config?: StructuredOutputMethodOptions<false>,
    ) =>
      resilient<T>(
        asCall(options.primary.withStructuredOutput<T>(schema, config)),
        asCall(options.fallback.withStructuredOutput<T>(schema, config)),
      ),
  };
};

export const createOpenRouterModel = (): ResilientModel => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  const fallbackModel = process.env.OPENROUTER_MODEL_FALLBACK;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  if (!model) throw new Error("OPENROUTER_MODEL is required");
  if (!fallbackModel) throw new Error("OPENROUTER_MODEL_FALLBACK is required");
  const chat = (id: string) =>
    new ChatOpenAI({
      apiKey,
      model: id,
      temperature: 0,
      maxRetries: 0,
      configuration: { baseURL: OPENROUTER_BASE_URL },
    });
  return createResilientModel({
    primary: chat(model),
    fallback: chat(fallbackModel),
    primaryModel: model,
    fallbackModel,
  });
};
