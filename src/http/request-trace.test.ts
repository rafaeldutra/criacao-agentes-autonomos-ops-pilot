import test from "node:test";
import assert from "node:assert/strict";
import type { TraceEvent } from "../agents/types.js";
import { chatEndFields, toRequestRecord, withRequestId } from "./request-trace.js";

const ID = "11111111-1111-4111-8111-111111111111";
const STARTED = "2026-10-13T14:02:11.120Z";
const trace: TraceEvent[] = [
  { type: "route", route: "react", reason: "r", node: "router" },
  { type: "answer", content: "ok", node: "react" },
];

test("withRequestId prepends requestId without mutating the body", () => {
  const body = { error: "boom", code: "X", issues: [1] };
  const wrapped = withRequestId(ID, body);
  assert.deepEqual(wrapped, { requestId: ID, error: "boom", code: "X", issues: [1] });
  assert.deepEqual(body, { error: "boom", code: "X", issues: [1] });
  assert.equal(Object.keys(wrapped)[0], "requestId");
});

test("toRequestRecord maps a 200 outcome with metrics subset and trace", () => {
  const record = toRequestRecord(ID, STARTED, 812.6, 200, {
    conversationId: "conv-1",
    userId: "u",
    reflect: true,
    route: "react",
    metrics: {
      llmCalls: 2,
      promptTokens: 10,
      modelUsed: "m",
      historyMessages: 3,
      memoryFacts: 1,
      contextBreakdown: { memory: 4, history: 30, message: 2, summary: 0 },
    },
    trace,
  });
  assert.deepEqual(record, {
    requestId: ID,
    createdAt: STARTED,
    conversationId: "conv-1",
    userId: "u",
    route: "react",
    reflect: true,
    status: 200,
    errorCode: undefined,
    latencyMs: 813,
    metrics: {
      llmCalls: 2,
      promptTokens: 10,
      modelUsed: "m",
      historyMessages: 3,
      memoryFacts: 1,
      contextBreakdown: { memory: 4, history: 30, message: 2, summary: 0 },
    },
    trace,
  });
});

test("toRequestRecord drops metrics, route and trace on errors and clamps latency", () => {
  const record = toRequestRecord(ID, STARTED, -3, 504, {
    conversationId: "conv-1",
    route: "react",
    metrics: { llmCalls: 1, historyMessages: 0, memoryFacts: 0 },
    trace,
    errorCode: "CHAT_TIMEOUT",
  });
  assert.equal(record.status, 504);
  assert.equal(record.errorCode, "CHAT_TIMEOUT");
  assert.equal(record.metrics, undefined);
  assert.equal(record.route, undefined);
  assert.deepEqual(record.trace, []);
  assert.equal(record.latencyMs, 0);
  assert.equal(record.conversationId, "conv-1");
  assert.deepEqual(toRequestRecord(ID, STARTED, 1, 400).trace, []);
});

test("chatEndFields summarizes the outcome without content", () => {
  assert.deepEqual(chatEndFields(undefined, 200), {});
  assert.deepEqual(
    chatEndFields(
      { route: "react", metrics: { llmCalls: 2, promptTokens: 120, modelUsed: "m", historyMessages: 0, memoryFacts: 0 }, trace },
      200,
    ),
    { errorCode: undefined, route: "react", llmCalls: 2, promptTokens: 120, modelUsed: "m", traceEvents: 2 },
  );
  assert.equal(chatEndFields({ errorCode: "CHAT_TIMEOUT", trace }, 504).traceEvents, 0);
});

test("toRequestRecord keeps route, metrics and the partial trace on a 202 pending approval", () => {
  const record = toRequestRecord(ID, STARTED, 10, 202, {
    route: "react",
    metrics: { llmCalls: 1, historyMessages: 0, memoryFacts: 0 },
    trace,
    approvalId: "a-1",
  });
  assert.equal(record.status, 202);
  assert.equal(record.route, "react");
  assert.equal(record.errorCode, undefined);
  assert.equal(record.metrics?.llmCalls, 1);
  assert.deepEqual(record.trace, trace);
  assert.equal(chatEndFields({ trace, approvalId: "a-1" }, 202).traceEvents, 2);
  assert.equal(chatEndFields({ trace, approvalId: "a-1" }, 202).approvalId, "a-1");
});
