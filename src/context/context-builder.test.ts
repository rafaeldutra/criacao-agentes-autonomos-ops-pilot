import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SECTION_BUDGET,
  buildContext,
  loadSectionBudgets,
  type SectionBudget,
} from "./context-builder.js";
import { estimateTokens } from "./tokens.js";
import { formatSummaryBlock } from "../conversation/summary-prompt.js";
import { formatHistoryOnly } from "../http/chat-history.js";
import { formatMemoryBlock } from "../memory/memory-prompt.js";
import type { RecalledMemory } from "../memory/memory-store.js";
import type { ConversationMessage } from "../store/conversation-store.js";

const msg = (
  id: string,
  role: "user" | "assistant",
  content: string,
): ConversationMessage => ({
  id,
  conversationId: "c1",
  role,
  content,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const fact = (id: string, text: string, score: number): RecalledMemory => ({
  id,
  fact: text,
  score,
});

test("loadSectionBudgets returns defaults for empty env", () => {
  assert.deepEqual(loadSectionBudgets({}), DEFAULT_SECTION_BUDGET);
  assert.deepEqual(DEFAULT_SECTION_BUDGET, { summary: 200, window: 1200, memories: 300 });
});

test("loadSectionBudgets falls back on invalid env values", () => {
  assert.deepEqual(
    loadSectionBudgets({
      CONTEXT_BUDGET_SUMMARY: "abc",
      CONTEXT_BUDGET_WINDOW: "-1",
      CONTEXT_BUDGET_MEMORIES: "",
    }),
    DEFAULT_SECTION_BUDGET,
  );
});

test("loadSectionBudgets reads valid env overrides", () => {
  assert.deepEqual(
    loadSectionBudgets({
      CONTEXT_BUDGET_SUMMARY: "10",
      CONTEXT_BUDGET_WINDOW: "20",
      CONTEXT_BUDGET_MEMORIES: "30",
    }),
    { summary: 10, window: 20, memories: 30 },
  );
});

test("buildContext keeps sections intact below default budgets", () => {
  const history = [msg("1", "user", "hi"), msg("2", "assistant", "hello")];
  const memories = [fact("m1", "likes coffee", 0.9)];
  const summary = "freeze dia 15";
  const built = buildContext({
    system: "You are OpsPilot.",
    summary,
    memories,
    history,
    message: "status",
  });

  assert.match(built.prompt, /You are OpsPilot\./);
  assert.match(built.prompt, /\[Conversation summary\]/);
  assert.match(built.prompt, /freeze dia 15/);
  assert.match(built.prompt, /\[Relevant memories\]/);
  assert.match(built.prompt, /likes coffee/);
  assert.match(built.prompt, /user: hi/);
  assert.match(built.prompt, /assistant: hello/);
  assert.match(built.prompt, /user: status/);
  assert.equal(built.sections.system, "You are OpsPilot.");
  assert.equal(built.sections.summary, formatSummaryBlock(summary));
  assert.equal(built.sections.memory, formatMemoryBlock(memories));
  assert.equal(built.keptHistory.length, 2);
  assert.equal(built.keptMemories.length, 1);
});

test("buildContext omits empty summary and memories", () => {
  const built = buildContext({ message: "ping" });
  assert.equal(built.sections.summary, "");
  assert.equal(built.sections.memory, "");
  assert.equal(built.sections.history, "");
  assert.equal(built.prompt, "user: ping");
});

test("window cut drops oldest first until newest fits", () => {
  const history = [
    msg("a", "user", "AAAA".repeat(40)),
    msg("b", "user", "BBBB".repeat(40)),
    msg("c", "user", "CCCC".repeat(40)),
  ];
  const onlyNewest = formatHistoryOnly(history.slice(-1));
  const budget: SectionBudget = {
    summary: 200,
    window: estimateTokens(onlyNewest),
    memories: 300,
  };
  const built = buildContext({ history, message: "now" }, budget);
  assert.deepEqual(
    built.keptHistory.map((m) => m.id),
    ["c"],
  );
  assert.doesNotMatch(built.prompt, /AAAA/);
  assert.match(built.prompt, /CCCC/);
});

test("window keeps newest message even when alone over budget", () => {
  const history = [msg("big", "user", "X".repeat(400))];
  const built = buildContext(
    { history, message: "now" },
    { summary: 0, window: 1, memories: 0 },
  );
  assert.equal(built.keptHistory.length, 1);
  assert.equal(built.keptHistory[0]?.id, "big");
});

test("memories cut drops lowest score first", () => {
  const memories = [
    fact("hi", "high relevance fact about coffee preferences in detail", 0.9),
    fact("mid", "medium score fact about tea habits for the user", 0.5),
    fact("lo", "low score trivia about weather and unrelated noise", 0.1),
  ];
  // Budget that fits only the highest-scoring formatted block
  const onlyHigh = formatMemoryBlock([memories[0]!]);
  const budget: SectionBudget = {
    summary: 0,
    window: 0,
    memories: estimateTokens(onlyHigh),
  };
  const built = buildContext({ memories, message: "q" }, budget);
  assert.deepEqual(
    built.keptMemories.map((m) => m.id),
    ["hi"],
  );
  assert.doesNotMatch(built.sections.memory, /weather/);
  assert.doesNotMatch(built.sections.memory, /tea habits/);
});

test("memories tie on score drops lower index first", () => {
  const memories = [
    fact("first", "same score alpha padding text here enough", 0.5),
    fact("second", "same score beta padding text here enough", 0.5),
  ];
  const one = formatMemoryBlock([memories[1]!]);
  // Budget fits exactly one fact block roughly — keep dropping until one remains
  const budget: SectionBudget = {
    summary: 0,
    window: 0,
    memories: estimateTokens(one),
  };
  const built = buildContext({ memories, message: "q" }, budget);
  // first (lower index) dropped first on equal score → second remains
  assert.deepEqual(
    built.keptMemories.map((m) => m.id),
    ["second"],
  );
});

test("summary truncates raw end to fit budget", () => {
  const long = "decision freeze ".repeat(80);
  const budget: SectionBudget = { summary: 20, window: 0, memories: 0 };
  const built = buildContext({ summary: long, message: "q" }, budget);
  assert.ok(estimateTokens(built.sections.summary) <= 20);
  assert.ok(built.sections.summary.length < formatSummaryBlock(long).length);
});

test("summary budget 0 omits summary block", () => {
  const built = buildContext(
    { summary: "keep me", system: "SYS", message: "MSG" },
    { summary: 0, window: 0, memories: 0 },
  );
  assert.equal(built.sections.summary, "");
  assert.equal(built.sections.system, "SYS");
  assert.equal(built.sections.message, "user: MSG");
  assert.match(built.prompt, /^SYS/);
  assert.match(built.prompt, /user: MSG$/);
});

test("SC-001 three messages window fits only newest", () => {
  const history = [
    msg("A", "user", "old-A-".repeat(30)),
    msg("B", "user", "mid-B-".repeat(30)),
    msg("C", "user", "new-C-".repeat(30)),
  ];
  const budget: SectionBudget = {
    summary: 0,
    window: estimateTokens(formatHistoryOnly([history[2]!])),
    memories: 0,
  };
  const built = buildContext({ history, message: "x" }, budget);
  assert.deepEqual(
    built.keptHistory.map((m) => m.id),
    ["C"],
  );
});

test("SC-002 scores 0.9/0.5/0.1 keeps highest only", () => {
  const memories = [
    fact("top", "alpha fact with enough characters to measure tokens properly", 0.9),
    fact("mid", "beta fact with enough characters to measure tokens properly", 0.5),
    fact("low", "gamma fact with enough characters to measure tokens properly", 0.1),
  ];
  const budget: SectionBudget = {
    summary: 0,
    window: 0,
    memories: estimateTokens(formatMemoryBlock([memories[0]!])),
  };
  const built = buildContext({ memories, message: "x" }, budget);
  assert.deepEqual(
    built.keptMemories.map((m) => m.score),
    [0.9],
  );
});

test("SC-003 zero budgets leave system and message intact", () => {
  const system = "SYSTEM_UNTOUCHABLE";
  const message = "MESSAGE_UNTOUCHABLE";
  const built = buildContext(
    {
      system,
      summary: "drop me",
      memories: [fact("m", "drop", 0.2)],
      history: [msg("h", "user", "drop history")],
      message,
    },
    { summary: 0, window: 0, memories: 0 },
  );
  assert.equal(built.sections.system, system);
  assert.equal(built.sections.message, `user: ${message}`);
  assert.ok(built.prompt.includes(system));
  assert.ok(built.prompt.endsWith(`user: ${message}`) || built.prompt.includes(`user: ${message}`));
});

test("SC-005 different budgets yield different kept sets", () => {
  const history = [
    msg("1", "user", "one-".repeat(20)),
    msg("2", "user", "two-".repeat(20)),
    msg("3", "user", "three-".repeat(20)),
  ];
  const low = buildContext(
    { history, message: "m" },
    { summary: 0, window: estimateTokens(formatHistoryOnly([history[2]!])), memories: 0 },
  );
  const high = buildContext(
    { history, message: "m" },
    { summary: 0, window: 10_000, memories: 0 },
  );
  assert.notDeepEqual(
    low.keptHistory.map((m) => m.id),
    high.keptHistory.map((m) => m.id),
  );
  assert.equal(high.keptHistory.length, 3);
  assert.equal(low.keptHistory.length, 1);
});
