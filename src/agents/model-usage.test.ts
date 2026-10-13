import test from "node:test";
import assert from "node:assert/strict";
import { drainFallbacks, recordFallback, recordModelUsed, runWithModelUsage } from "./model-usage.js";

const record = { fromModel: "primary", toModel: "backup", reason: "503 down" };

test("record calls are no-ops outside a scope", () => {
  recordModelUsed("primary");
  recordFallback(record);
  assert.deepEqual(drainFallbacks(), []);
});

test("returns the last model used in the scope", async () => {
  const { result, modelUsed } = await runWithModelUsage(async () => {
    recordModelUsed("primary");
    await Promise.resolve();
    recordModelUsed("backup");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(modelUsed, "backup");
});

test("omits modelUsed when no model call happened", async () => {
  const usage = await runWithModelUsage(async () => 1);
  assert.equal("modelUsed" in usage, false);
});

test("drainFallbacks returns pending records and clears them", async () => {
  await runWithModelUsage(async () => {
    recordFallback(record);
    assert.deepEqual(drainFallbacks(), [record]);
    assert.deepEqual(drainFallbacks(), []);
  });
});

test("concurrent scopes stay isolated", async () => {
  const run = (model: string, delayMs: number) =>
    runWithModelUsage(async () => {
      recordModelUsed(model);
      recordFallback({ ...record, toModel: model });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return drainFallbacks();
    });

  const [first, second] = await Promise.all([run("a", 10), run("b", 0)]);
  assert.equal(first.modelUsed, "a");
  assert.equal(second.modelUsed, "b");
  assert.deepEqual(first.result.map((entry) => entry.toModel), ["a"]);
  assert.deepEqual(second.result.map((entry) => entry.toModel), ["b"]);
});
