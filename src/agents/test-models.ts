import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";
import { RunnableLambda } from "@langchain/core/runnables";
import type { ChatModelSource } from "./model.js";

/** Test-only helpers: scripted chat models that never touch the network. */

export const statusError = (status: number | undefined, message: string): Error =>
  Object.assign(new Error(message), status === undefined ? {} : { status });

export type ScriptedModelOptions = {
  /** Fail the first N calls (Infinity = always fail). */
  failures?: number;
  error?: () => Error;
  reply?: string;
  structured?: Record<string, unknown>;
};

export type ScriptedModelState = {
  calls: number;
  tools: unknown[];
  schemas: unknown[];
};

export const createScriptedModel = (
  options: ScriptedModelOptions = {},
): { model: ChatModelSource; state: ScriptedModelState } => {
  const state: ScriptedModelState = { calls: 0, tools: [], schemas: [] };
  const failures = options.failures ?? 0;
  const error = options.error ?? (() => statusError(503, "upstream unavailable"));

  const attempt = async (): Promise<void> => {
    state.calls += 1;
    if (state.calls <= failures) throw error();
  };
  const chat = RunnableLambda.from(async (_input: BaseLanguageModelInput) => {
    await attempt();
    return new AIMessageChunk(options.reply ?? "ok");
  });

  const model = {
    invoke: (input: BaseLanguageModelInput) => chat.invoke(input),
    bindTools: (tools: unknown[]) => {
      state.tools.push(...tools);
      return chat;
    },
    withStructuredOutput: (schema: unknown) => {
      state.schemas.push(schema);
      return RunnableLambda.from(async (_input: BaseLanguageModelInput) => {
        await attempt();
        return options.structured ?? {};
      });
    },
  } as unknown as ChatModelSource;

  return { model, state };
};
