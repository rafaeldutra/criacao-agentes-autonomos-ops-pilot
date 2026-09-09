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
});
