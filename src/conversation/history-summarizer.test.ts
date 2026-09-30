import test from "node:test";
import assert from "node:assert/strict";
import { FakeConversationStore } from "../store/fake-conversation-store.js";
import {
  SUMMARIZER_PROMPT,
  createFakeHistorySummarizer,
  maybeSummarizeAfterTurn,
} from "./history-summarizer.js";
import { formatSummaryBlock } from "./summary-prompt.js";

const seedMessages = (store: FakeConversationStore, id: string, count: number): void => {
  for (let index = 0; index < count; index += 1) {
    store.append(id, index % 2 === 0 ? "user" : "assistant", `m${index}`);
  }
};

test("SUMMARIZER_PROMPT covers decisions facts pending and 150 tokens", () => {
  assert.match(SUMMARIZER_PROMPT, /150 tokens/i);
  assert.match(SUMMARIZER_PROMPT, /decisões/i);
  assert.match(SUMMARIZER_PROMPT, /fatos/i);
  assert.match(SUMMARIZER_PROMPT, /pendências/i);
  assert.match(SUMMARIZER_PROMPT, /resumo anterior/i);
});

test("formatSummaryBlock omits empty and wraps non-empty", () => {
  assert.equal(formatSummaryBlock(""), "");
  assert.equal(formatSummaryBlock("  "), "");
  assert.equal(formatSummaryBlock("freeze dia 15"), "[Conversation summary]\nfreeze dia 15\n\n");
});

test("maybeSummarizeAfterTurn is no-op when total <= 8", async () => {
  const store = new FakeConversationStore();
  const id = store.create();
  seedMessages(store, id, 8);
  const fake = createFakeHistorySummarizer();
  const result = await maybeSummarizeAfterTurn({
    conversations: store,
    conversationId: id,
    summarizer: fake,
  });
  assert.equal(result, undefined);
  assert.equal(fake.calls.length, 0);
  assert.equal(store.getSummary(id), undefined);
});

test("maybeSummarizeAfterTurn runs once at total=16 and advances coveredCount", async () => {
  const store = new FakeConversationStore();
  const id = store.create();
  seedMessages(store, id, 16);
  const fake = createFakeHistorySummarizer();
  const result = await maybeSummarizeAfterTurn({
    conversations: store,
    conversationId: id,
    summarizer: fake,
  });
  assert.ok(result);
  assert.equal(result.event.type, "summarize");
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]?.previousSummary, "");
  assert.equal(fake.calls[0]?.batch.length, 8);
  assert.equal(fake.calls[0]?.batch[0]?.content, "m0");
  assert.equal(store.getSummary(id)?.coveredCount, 8);
  assert.equal(store.getSummary(id)?.summary, result.summary);
  assert.match(result.summary, /^NEW:/);
});

test("maybeSummarizeAfterTurn merges previous summary on second batch", async () => {
  const store = new FakeConversationStore();
  const id = store.create();
  seedMessages(store, id, 24);
  store.upsertSummary(id, "prev-summary", 8);
  const fake = createFakeHistorySummarizer();
  const result = await maybeSummarizeAfterTurn({
    conversations: store,
    conversationId: id,
    summarizer: fake,
  });
  assert.ok(result);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]?.previousSummary, "prev-summary");
  assert.equal(fake.calls[0]?.batch[0]?.content, "m8");
  assert.equal(store.getSummary(id)?.coveredCount, 16);
  assert.match(result.summary, /^MERGE:prev-summary\+/);
});

test("maybeSummarizeAfterTurn does not advance pointer when summarizer throws", async () => {
  const store = new FakeConversationStore();
  const id = store.create();
  seedMessages(store, id, 16);
  const errors: unknown[] = [];
  const result = await maybeSummarizeAfterTurn({
    conversations: store,
    conversationId: id,
    summarizer: async () => {
      throw new Error("boom");
    },
    onError: (error) => errors.push(error),
  });
  assert.equal(result, undefined);
  assert.equal(errors.length, 1);
  assert.equal(store.getSummary(id), undefined);
});

test("maybeSummarizeAfterTurn no-op for incomplete outside window (total=15)", async () => {
  const store = new FakeConversationStore();
  const id = store.create();
  seedMessages(store, id, 15);
  const fake = createFakeHistorySummarizer();
  assert.equal(
    await maybeSummarizeAfterTurn({ conversations: store, conversationId: id, summarizer: fake }),
    undefined,
  );
  assert.equal(fake.calls.length, 0);
});
