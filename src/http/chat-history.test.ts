import test from "node:test";
import assert from "node:assert/strict";
import { HISTORY_WINDOW, formatChatHistory } from "./chat-history.js";
import type { ConversationMessage } from "../store/conversation-store.js";

const message = (
  index: number,
  role: "user" | "assistant",
  content: string,
): ConversationMessage => ({
  id: `msg-${index}`,
  conversationId: "conv-1",
  role,
  content,
  createdAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
});

test("HISTORY_WINDOW is 12", () => {
  assert.equal(HISTORY_WINDOW, 12);
});

test("formatChatHistory orders oldest to newest and appends current message", () => {
  const history = [
    message(1, "user", "one"),
    message(2, "assistant", "two"),
    message(3, "user", "three"),
  ];
  const formatted = formatChatHistory(history, "now");
  assert.equal(formatted, "user: one\nassistant: two\nuser: three\nuser: now");
});

test("formatChatHistory keeps only the last HISTORY_WINDOW prior messages", () => {
  const history = Array.from({ length: 15 }, (_, index) =>
    message(index, index % 2 === 0 ? "user" : "assistant", `m${index}`),
  );
  const formatted = formatChatHistory(history, "current");
  const lines = formatted.split("\n");
  assert.equal(lines.length, HISTORY_WINDOW + 1);
  assert.equal(lines[0], "assistant: m3");
  assert.equal(lines.at(-2), "user: m14");
  assert.equal(lines.at(-1), "user: current");
});
