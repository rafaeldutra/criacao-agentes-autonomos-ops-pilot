import test from "node:test";
import assert from "node:assert/strict";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  createOpenRouterModel,
  createResilientModel,
  fallbackReason,
  isRetryableModelError,
  MODEL_SERVICE_UNAVAILABLE,
  ModelUnavailableError,
  type ResilientModelOptions,
} from "./model.js";
import { drainFallbacks, runWithModelUsage } from "./model-usage.js";
import { createScriptedModel, statusError, type ScriptedModelOptions } from "./test-models.js";

const input = [new HumanMessage("status")];
const schema = z.object({ route: z.string() });

const setup = (
  primaryOptions: ScriptedModelOptions = {},
  fallbackOptions: ScriptedModelOptions = {},
  retry: ResilientModelOptions["retry"] = { stopAfterAttempt: 2 },
) => {
  const primary = createScriptedModel({ reply: "primary answer", structured: { route: "react" }, ...primaryOptions });
  const fallback = createScriptedModel({ reply: "fallback answer", structured: { route: "plan-and-execute" }, ...fallbackOptions });
  const model = createResilientModel({
    primary: primary.model,
    fallback: fallback.model,
    primaryModel: "primary/model",
    fallbackModel: "fallback/model",
    retry,
  });
  return { model, primary: primary.state, fallback: fallback.state };
};

test("healthy primary answers invoke, bindTools and withStructuredOutput", async () => {
  const { model, primary, fallback } = setup();

  const usage = await runWithModelUsage(async () => {
    const message = await model.invoke(input);
    const bound = await model.bindTools([]).invoke(input);
    const structured = await model.withStructuredOutput(schema).invoke(input);
    return { message, bound, structured, fallbacks: drainFallbacks() };
  });

  assert.equal(usage.result.message.content, "primary answer");
  assert.equal(usage.result.bound.content, "primary answer");
  assert.deepEqual(usage.result.structured, { route: "react" });
  assert.deepEqual(usage.result.fallbacks, []);
  assert.equal(usage.modelUsed, "primary/model");
  assert.equal(primary.calls, 3);
  assert.equal(fallback.calls, 0);
});

test("transient primary failure is retried without fallback", async () => {
  const { model, primary, fallback } = setup({ failures: 1 });

  const usage = await runWithModelUsage(async () => ({
    message: await model.invoke(input),
    fallbacks: drainFallbacks(),
  }));

  assert.equal(usage.result.message.content, "primary answer");
  assert.deepEqual(usage.result.fallbacks, []);
  assert.equal(usage.modelUsed, "primary/model");
  assert.equal(primary.calls, 2);
  assert.equal(fallback.calls, 0);
});

test("exhausted primary falls back and records the switch", async () => {
  const { model, primary, fallback } = setup({ failures: Infinity }, {}, { stopAfterAttempt: 1 });

  const usage = await runWithModelUsage(async () => ({
    message: await model.invoke(input),
    fallbacks: drainFallbacks(),
  }));

  assert.equal(usage.result.message.content, "fallback answer");
  assert.equal(usage.modelUsed, "fallback/model");
  assert.deepEqual(usage.result.fallbacks, [
    { fromModel: "primary/model", toModel: "fallback/model", reason: "503 upstream unavailable" },
  ]);
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
});

test("non-retryable primary error goes straight to the fallback", async () => {
  const { model, primary, fallback } = setup(
    { failures: Infinity, error: () => statusError(401, "invalid api key") },
    {},
    { stopAfterAttempt: 3 },
  );

  const usage = await runWithModelUsage(async () => ({
    message: await model.invoke(input),
    fallbacks: drainFallbacks(),
  }));

  assert.equal(usage.result.message.content, "fallback answer");
  assert.equal(usage.result.fallbacks[0]?.reason, "401 invalid api key");
  assert.equal(primary.calls, 1);
  assert.equal(fallback.calls, 1);
});

test("fallback receives the same tools and structured output schema", async () => {
  const { model, primary, fallback } = setup({ failures: Infinity }, {}, { stopAfterAttempt: 1 });
  const tool = { name: "list_alerts", description: "list", schema: z.object({}) };

  const usage = await runWithModelUsage(async () => ({
    bound: await model.bindTools([tool]).invoke(input),
    structured: await model.withStructuredOutput(schema).invoke(input),
  }));

  assert.equal(usage.result.bound.content, "fallback answer");
  assert.deepEqual(usage.result.structured, { route: "plan-and-execute" });
  assert.deepEqual(fallback.tools, [tool]);
  assert.deepEqual(primary.tools, [tool]);
  assert.deepEqual(fallback.schemas, [schema]);
});

test("fallback reason is sanitized to status plus first line, at most 200 chars", () => {
  const error = statusError(500, `${"x".repeat(300)}\n    at secret (stack.ts:1:1)`);
  const reason = fallbackReason(error);
  assert.ok(reason.startsWith("500 xxx"));
  assert.equal(reason.length, 200);
  assert.doesNotMatch(reason, /stack\.ts/);
  assert.equal(fallbackReason("boom"), "boom");
});

test("classifies retryable model errors", () => {
  assert.equal(isRetryableModelError(statusError(429, "rate limited")), true);
  assert.equal(isRetryableModelError(statusError(503, "down")), true);
  assert.equal(isRetryableModelError(new Error("socket hang up")), true);
  for (const status of [400, 401, 403, 404, 422]) {
    assert.equal(isRetryableModelError(statusError(status, "no")), false);
  }
});

test("both models failing rejects with ModelUnavailableError on every surface", async () => {
  const primaryError = statusError(503, "primary down");
  const { model } = setup(
    { failures: Infinity, error: () => primaryError },
    { failures: Infinity, error: () => statusError(502, "fallback down") },
    { stopAfterAttempt: 1 },
  );
  const isUnavailable = (error: unknown) =>
    error instanceof ModelUnavailableError &&
    error.code === MODEL_SERVICE_UNAVAILABLE &&
    error.message === "Language model service unavailable" &&
    error.cause === primaryError;

  await runWithModelUsage(async () => {
    await assert.rejects(() => model.invoke(input), isUnavailable);
    await assert.rejects(() => model.bindTools([]).invoke(input), isUnavailable);
    await assert.rejects(() => model.withStructuredOutput(schema).invoke(input), isUnavailable);
    assert.deepEqual(drainFallbacks(), []);
  });
});

const ENV_KEYS = ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_MODEL_FALLBACK"] as const;

const withEnv = (values: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => void) => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of ENV_KEYS) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

test("createOpenRouterModel reads primary and fallback ids from the environment", () => {
  withEnv(
    { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "primary/model", OPENROUTER_MODEL_FALLBACK: "fallback/model" },
    () => {
      const model = createOpenRouterModel();
      assert.equal(model.primaryModel, "primary/model");
      assert.equal(model.fallbackModel, "fallback/model");
    },
  );
});

test("createOpenRouterModel requires OPENROUTER_MODEL_FALLBACK", () => {
  withEnv({ OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "primary/model" }, () => {
    assert.throws(() => createOpenRouterModel(), /OPENROUTER_MODEL_FALLBACK is required/);
  });
});

test("retry.stopAfterAttempt bounds primary attempts", async () => {
  const { model, primary } = setup({ failures: Infinity }, {}, { stopAfterAttempt: 1 });

  await runWithModelUsage(() => model.invoke(input)).catch(() => undefined);

  assert.equal(primary.calls, 1);
});
