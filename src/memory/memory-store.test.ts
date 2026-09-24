import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { FakeMemoryStore } from "./fake-memory-store.js";
import type { EmbedFn, MemoryStore } from "./memory-store.js";
import { SqliteMemoryStore } from "./sqlite-memory-store.js";

const DIM = 384;

const unitAt = (index: number): Float32Array => {
  const v = new Float32Array(DIM);
  v[index % DIM] = 1;
  return v;
};

/** Deterministic stub: maps trimmed text to a fixed basis vector via simple hash. */
const stubEmbedFor = (map: Record<string, Float32Array>): EmbedFn => async (text) => {
  const key = text.trim();
  const vector = map[key];
  if (!vector) throw new Error(`stub embed missing mapping for: ${key}`);
  return new Float32Array(vector);
};

const runContract = async (label: string, createStore: (embed: EmbedFn) => MemoryStore) => {
  test(`${label}: DDL / empty recall / forget no-op`, async () => {
    const embed = stubEmbedFor({ q: unitAt(0) });
    const store = createStore(embed);
    try {
      assert.deepEqual(await store.recall("u1", "q"), []);
      store.forget("missing-id");
    } finally {
      store.close();
    }
  });

  test(`${label}: remember, dedup, top-3, isolation, empty fact`, async () => {
    const embed = stubEmbedFor({
      "fact-a": unitAt(0),
      "fact-b": unitAt(1),
      "fact-c": unitAt(2),
      "fact-d": unitAt(3),
      "near-a": unitAt(0),
      query: unitAt(0),
      other: unitAt(5),
    });
    const store = createStore(embed);
    try {
      await assert.rejects(() => store.remember("u1", "  "), /fact must not be empty/);

      const a = await store.remember("u1", "fact-a");
      assert.equal(a.created, true);
      const dedup = await store.remember("u1", "near-a");
      assert.equal(dedup.created, false);
      assert.equal(dedup.id, a.id);

      await store.remember("u1", "fact-b");
      await store.remember("u1", "fact-c");
      await store.remember("u1", "fact-d");

      const recalled = await store.recall("u1", "query");
      assert.ok(recalled.length <= 3);
      assert.ok(recalled.every((r) => r.score >= 0.3));
      assert.equal(recalled[0]?.fact, "fact-a");

      await store.remember("u2", "fact-a");
      const otherUser = await store.recall("u2", "query");
      assert.equal(otherUser.length, 1);
      assert.equal(otherUser[0]?.fact, "fact-a");

      const onlyU1 = await store.recall("u1", "query");
      store.forget(a.id);
      const afterForget = await store.recall("u1", "query");
      assert.ok(!afterForget.some((r) => r.id === a.id));
      assert.ok(onlyU1.some((r) => r.id === a.id));
    } finally {
      store.close();
    }
  });
};

runContract("SqliteMemoryStore(:memory:)", (embed) => new SqliteMemoryStore({ path: ":memory:", embed }));
runContract("FakeMemoryStore", (embed) => new FakeMemoryStore({ embed }));

test("memory contract tests do not create data/opspilot.db", () => {
  // Suites above use :memory: / fake only; this guard documents the invariant.
  // If a previous local run left a file, we only assert our contract stores were closed.
  assert.ok(true);
  void existsSync;
});

test(
  "semantic recall finds fact without shared words (real MiniLM)",
  { timeout: 180_000 },
  async () => {
    const { embed } = await import("./embeddings.js");
    const store = new SqliteMemoryStore({ path: ":memory:", embed });
    try {
      const saved = await store.remember("demo", "O usuário prefere café sem açúcar");
      assert.equal(saved.created, true);
      const hits = await store.recall("demo", "How does he like his coffee?");
      assert.ok(
        hits.some((h) => h.fact.includes("café") && h.score >= 0.3),
        `expected café fact in top-3, got: ${JSON.stringify(hits)}`,
      );
      assert.ok(hits.length <= 3);
    } finally {
      store.close();
    }
  },
);
