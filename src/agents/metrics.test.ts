import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { metricsFromMessages } from "./strategy.js";

test("metrics count model messages and latency", () => {
  const metrics = metricsFromMessages(Date.now() - 2, [
    new HumanMessage("input"),
    new AIMessage("output"),
  ]);
  assert.equal(metrics.llmCalls, 1);
  assert.ok(metrics.latencyMs >= 0);
  assert.equal(metrics.promptTokens, undefined);
});

test("metricsFromMessages sets promptTokens from AI usage_metadata", () => {
  const metrics = metricsFromMessages(Date.now(), [
    new HumanMessage("input"),
    new AIMessage({
      content: "a",
      usage_metadata: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
    }),
    new AIMessage({
      content: "b",
      usage_metadata: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
    }),
  ]);
  assert.equal(metrics.promptTokens, 15);
  assert.equal(metrics.llmCalls, 2);
});

test("metricsFromMessages omits promptTokens when usage is absent", () => {
  const metrics = metricsFromMessages(Date.now(), [
    new HumanMessage("input"),
    new AIMessage("output"),
  ]);
  assert.ok(!("promptTokens" in metrics) || metrics.promptTokens === undefined);
});
