import test from "node:test";
import assert from "node:assert/strict";
import {
  CONVERSATION_NOT_FOUND,
  DomainError,
  type ConversationStore,
} from "./conversation-store.js";
import { FakeConversationStore } from "./fake-conversation-store.js";
import { SqliteConversationStore } from "./sqlite-conversation-store.js";

const contractSequence = (store: ConversationStore): void => {
  const id = store.create();
  assert.equal(store.exists(id), true);
  assert.deepEqual(store.lastMessages(id, 12), []);

  store.append(id, "user", "hello");
  store.append(id, "assistant", "hi");
  store.append(id, "user", "status?");
  store.append(id, "assistant", "ok");

  const lastTwo = store.lastMessages(id, 2);
  assert.equal(lastTwo.length, 2);
  assert.equal(lastTwo[0]?.role, "user");
  assert.equal(lastTwo[0]?.content, "status?");
  assert.equal(lastTwo[1]?.role, "assistant");
  assert.equal(lastTwo[1]?.content, "ok");

  const all = store.lastMessages(id, 12);
  assert.equal(all.length, 4);
  assert.equal(all[0]?.content, "hello");
  assert.equal(all[3]?.content, "ok");
};

const unknownIdErrors = (store: ConversationStore): void => {
  assert.throws(
    () => store.append("missing", "user", "x"),
    (error: unknown) => error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND,
  );
  assert.throws(
    () => store.lastMessages("missing", 12),
    (error: unknown) => error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND,
  );
  assert.throws(
    () => store.getSummary("missing"),
    (error: unknown) => error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND,
  );
  assert.throws(
    () => store.upsertSummary("missing", "x", 0),
    (error: unknown) => error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND,
  );
  assert.throws(
    () => store.messageCount("missing"),
    (error: unknown) => error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND,
  );
  assert.throws(
    () => store.messagesAscending("missing", 0, 1),
    (error: unknown) => error instanceof DomainError && error.code === CONVERSATION_NOT_FOUND,
  );
};

const summaryContract = (store: ConversationStore): void => {
  const id = store.create();
  assert.equal(store.getSummary(id), undefined);
  assert.equal(store.messageCount(id), 0);

  for (let index = 0; index < 4; index += 1) {
    store.append(id, "user", `u${index}`);
    store.append(id, "assistant", `a${index}`);
  }
  assert.equal(store.messageCount(id), 8);

  const slice = store.messagesAscending(id, 2, 3);
  assert.equal(slice.length, 3);
  assert.equal(slice[0]?.content, "u1");
  assert.equal(slice[1]?.content, "a1");
  assert.equal(slice[2]?.content, "u2");

  store.upsertSummary(id, "first summary", 8);
  const first = store.getSummary(id);
  assert.equal(first?.summary, "first summary");
  assert.equal(first?.coveredCount, 8);
  assert.equal(first?.conversationId, id);

  store.upsertSummary(id, "merged summary", 16);
  const second = store.getSummary(id);
  assert.equal(second?.summary, "merged summary");
  assert.equal(second?.coveredCount, 16);
};

test("SqliteConversationStore :memory: creates schema and supports create/append/lastMessages", () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    const tables = store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('conversations', 'messages', 'conversation_summaries') ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((row) => row.name),
      ["conversation_summaries", "conversations", "messages"],
    );
    new SqliteConversationStore(":memory:");
    contractSequence(store);
  } finally {
    store.close();
  }
});

test("SqliteConversationStore rejects unknown ids and invalid roles", () => {
  const store = new SqliteConversationStore(":memory:");
  try {
    unknownIdErrors(store);
    const id = store.create();
    const invalidRole = "system" as "user" | "assistant";
    assert.throws(() => store.append(id, invalidRole, "nope"));
  } finally {
    store.close();
  }
});

test("FakeConversationStore matches the conversation contract", () => {
  const store = new FakeConversationStore();
  contractSequence(store);
  unknownIdErrors(store);
  store.close();
});

test("shared contract parity between fake and :memory: SQLite", () => {
  const fake = new FakeConversationStore();
  const sqlite = new SqliteConversationStore(":memory:");
  try {
    const run = (store: ConversationStore) => {
      const id = store.create();
      for (let index = 0; index < 5; index += 1) {
        store.append(id, "user", `u${index}`);
        store.append(id, "assistant", `a${index}`);
      }
      return store.lastMessages(id, 4).map((message) => ({ role: message.role, content: message.content }));
    };
    assert.deepEqual(run(fake), run(sqlite));
  } finally {
    sqlite.close();
    fake.close();
  }
});

test("conversation contract tests use :memory: and fake without opening the default db path", () => {
  const sqlite = new SqliteConversationStore(":memory:");
  const fake = new FakeConversationStore();
  try {
    contractSequence(sqlite);
    contractSequence(fake);
    assert.ok(sqlite.db);
  } finally {
    sqlite.close();
    fake.close();
  }
});

test("conversation_summaries CRUD works for Sqlite and Fake", () => {
  const sqlite = new SqliteConversationStore(":memory:");
  const fake = new FakeConversationStore();
  try {
    summaryContract(sqlite);
    summaryContract(fake);
  } finally {
    sqlite.close();
    fake.close();
  }
});
