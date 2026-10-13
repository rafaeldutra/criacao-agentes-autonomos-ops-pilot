import test from "node:test";
import assert from "node:assert/strict";
import type { RequestSummary } from "../store/request-store.js";
import { computeStats, isFreeModel, loadModelPrices, parseWindow } from "./stats.js";

const WINDOW = { since: "24h", from: "2026-10-12T12:00:00.000Z", to: "2026-10-13T12:00:00.000Z" };

const row = (overrides: Partial<RequestSummary>): RequestSummary => ({
  createdAt: "2026-10-13T10:00:00.000Z",
  route: "react",
  status: 200,
  latencyMs: 100,
  promptTokens: 1000,
  modelUsed: "openai/gpt-4o-mini",
  ...overrides,
});

test("parseWindow accepts m/h/d up to 90d and rejects the rest", () => {
  assert.equal(parseWindow("30m"), 30 * 60_000);
  assert.equal(parseWindow("24h"), 24 * 3_600_000);
  assert.equal(parseWindow("7d"), 7 * 86_400_000);
  assert.equal(parseWindow("90d"), 90 * 86_400_000);
  for (const bad of ["", "24", "h", "0h", "-1h", "1.5h", "1w", "91d", "24 h"]) {
    assert.equal(parseWindow(bad), undefined, bad);
  }
});

test("isFreeModel covers :free variants and the free router", () => {
  assert.equal(isFreeModel("meta-llama/llama-3.3-70b-instruct:free"), true);
  assert.equal(isFreeModel("openrouter/free"), true);
  assert.equal(isFreeModel("openai/gpt-4o-mini"), false);
});

test("loadModelPrices parses JSON and rejects invalid prices", () => {
  assert.deepEqual(loadModelPrices({}), {});
  assert.deepEqual(loadModelPrices({ OPSPILOT_MODEL_PRICES: '{"a/b":0.15}' }), { "a/b": 0.15 });
  assert.throws(() => loadModelPrices({ OPSPILOT_MODEL_PRICES: "[1]" }));
  assert.throws(() => loadModelPrices({ OPSPILOT_MODEL_PRICES: '{"a/b":"x"}' }));
  assert.throws(() => loadModelPrices({ OPSPILOT_MODEL_PRICES: '{"a/b":-1}' }));
  assert.throws(() => loadModelPrices({ OPSPILOT_MODEL_PRICES: "{" }));
});

test("computeStats on an empty window has zeros and null percentiles", () => {
  assert.deepEqual(computeStats([], WINDOW, {}), {
    ...WINDOW,
    total: 0,
    errors: 0,
    promptTokens: 0,
    costUsd: 0,
    unpricedRequests: 0,
    latencyMs: { p50: null, p95: null },
    byRoute: {},
    byModel: {},
  });
});

test("computeStats totals, nearest-rank percentiles, cost and groups", () => {
  const rows: RequestSummary[] = [
    ...Array.from({ length: 18 }, (_, index) => row({ latencyMs: (index + 1) * 10 })),
    row({ route: "plan-and-execute", modelUsed: "x/y:free", promptTokens: 5000, latencyMs: 500 }),
    row({ route: null, modelUsed: null, promptTokens: null, status: 504, latencyMs: 2000 }),
  ];
  const stats = computeStats(rows, WINDOW, { "openai/gpt-4o-mini": 0.15 });

  assert.equal(stats.total, 20);
  assert.equal(stats.errors, 1);
  assert.equal(stats.promptTokens, 18 * 1000 + 5000);
  // 18k tokens at $0.15/1M; the :free row costs 0.
  assert.equal(stats.costUsd, 0.0027);
  assert.equal(stats.unpricedRequests, 0);
  // Sorted latencies: 10..180, 500, 2000 → p50 = 10th value, p95 = 19th value.
  assert.deepEqual(stats.latencyMs, { p50: 100, p95: 500 });

  assert.deepEqual(Object.keys(stats.byRoute).sort(), ["plan-and-execute", "react", "unknown"]);
  assert.equal(stats.byRoute.react?.total, 18);
  assert.equal(stats.byRoute.unknown?.errors, 1);
  assert.equal(stats.byModel["x/y:free"]?.costUsd, 0);
  assert.equal(stats.byModel["openai/gpt-4o-mini"]?.costUsd, 0.0027);
  assert.equal(stats.byModel.unknown?.total, 1);
});

test("computeStats counts models without a price as unpriced instead of free", () => {
  const stats = computeStats([row({ modelUsed: "anthropic/claude" }), row({})], WINDOW, {});
  assert.equal(stats.costUsd, 0);
  assert.equal(stats.unpricedRequests, 2);
});
