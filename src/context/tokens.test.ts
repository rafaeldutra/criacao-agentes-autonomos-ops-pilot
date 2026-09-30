import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import {
  buildContextBreakdown,
  estimateTokens,
  promptTokensFromUsage,
  sumPromptTokensFromMessages,
} from "./tokens.js";

test("estimateTokens uses floor chars/4", () => {
  assert.equal(estimateTokens("abcdefghij"), 2);
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abc"), 0);
  assert.equal(estimateTokens("abcd"), 1);
});

test("promptTokensFromUsage reads input_tokens", () => {
  assert.equal(promptTokensFromUsage({ input_tokens: 42, output_tokens: 1, total_tokens: 43 }), 42);
  assert.equal(promptTokensFromUsage({ input_tokens: 0, output_tokens: 0, total_tokens: 0 }), 0);
});

test("promptTokensFromUsage returns undefined for missing or invalid usage", () => {
  assert.equal(promptTokensFromUsage(undefined), undefined);
  assert.equal(promptTokensFromUsage(null), undefined);
  assert.equal(promptTokensFromUsage({}), undefined);
  assert.equal(promptTokensFromUsage({ input_tokens: -1 }), undefined);
  assert.equal(promptTokensFromUsage({ input_tokens: "10" }), undefined);
});

test("sumPromptTokensFromMessages sums AI usage and skips missing", () => {
  const withUsage = (input_tokens: number) =>
    new AIMessage({
      content: "x",
      usage_metadata: { input_tokens, output_tokens: 1, total_tokens: input_tokens + 1 },
    });

  assert.equal(
    sumPromptTokensFromMessages([new HumanMessage("hi"), withUsage(10), withUsage(5)]),
    15,
  );
  assert.equal(sumPromptTokensFromMessages([new HumanMessage("hi"), new AIMessage("out")]), undefined);
});

test("buildContextBreakdown estimates each source", () => {
  const breakdown = buildContextBreakdown({
    memory: "abcd",
    history: "abcdefghij",
    message: "user: hi",
    summary: "xy",
  });
  assert.deepEqual(breakdown, {
    memory: estimateTokens("abcd"),
    history: estimateTokens("abcdefghij"),
    message: estimateTokens("user: hi"),
    summary: estimateTokens("xy"),
  });
});

test("buildContextBreakdown uses zeros for empty sources", () => {
  assert.deepEqual(buildContextBreakdown({ memory: "", history: "", message: "" }), {
    memory: 0,
    history: 0,
    message: 0,
    summary: 0,
  });
});
