import {
  DEDUP_THRESHOLD,
  RECALL_MIN_SCORE,
  RECALL_TOP_K,
  findDedupMatch,
  topkByScore,
} from "./memory-ranking.js";
import type { EmbedFn, MemoryStore, RecalledMemory, RememberResult } from "./memory-store.js";

type StoredMemory = {
  id: string;
  userId: string;
  fact: string;
  embedding: Float32Array;
  createdAt: string;
};

const newId = (): string => `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export type FakeMemoryStoreOptions = {
  embed?: EmbedFn;
};

/** In-memory MemoryStore for HTTP/unit tests. Uses stub embed when provided. */
export class FakeMemoryStore implements MemoryStore {
  private readonly memories = new Map<string, StoredMemory>();
  private readonly embed: EmbedFn;

  constructor(options: FakeMemoryStoreOptions = {}) {
    this.embed =
      options.embed ??
      (async () => {
        throw new Error("FakeMemoryStore requires embed or preloaded vectors via remember with inject");
      });
  }

  /** Seed a fact with an explicit embedding (no embed call). */
  seed(userId: string, fact: string, embedding: Float32Array, id = newId()): string {
    this.memories.set(id, {
      id,
      userId,
      fact,
      embedding,
      createdAt: new Date().toISOString(),
    });
    return id;
  }

  async remember(userId: string, fact: string): Promise<RememberResult> {
    const uid = userId.trim();
    const text = fact.trim();
    if (!uid) throw new Error("userId must not be empty");
    if (!text) throw new Error("fact must not be empty");

    const vector = await this.embed(text);
    const candidates = [...this.memories.values()]
      .filter((m) => m.userId === uid)
      .map((m) => ({ id: m.id, embedding: m.embedding }));
    const dedup = findDedupMatch(vector, candidates, DEDUP_THRESHOLD);
    if (dedup) return { id: dedup.id, created: false };

    const id = newId();
    this.memories.set(id, {
      id,
      userId: uid,
      fact: text,
      embedding: vector,
      createdAt: new Date().toISOString(),
    });
    return { id, created: true };
  }

  async recall(userId: string, query: string): Promise<RecalledMemory[]> {
    const uid = userId.trim();
    const text = query.trim();
    if (!uid) throw new Error("userId must not be empty");
    if (!text) throw new Error("query must not be empty");

    const q = await this.embed(text);
    const scored = [...this.memories.values()]
      .filter((m) => m.userId === uid)
      .map((m) => {
        let score = 0;
        for (let i = 0; i < q.length; i += 1) score += q[i]! * m.embedding[i]!;
        return { id: m.id, fact: m.fact, score };
      });

    return topkByScore(scored, RECALL_TOP_K, RECALL_MIN_SCORE);
  }

  forget(id: string): void {
    this.memories.delete(id);
  }

  close(): void {
    this.memories.clear();
  }

  countForUser(userId: string): number {
    return [...this.memories.values()].filter((m) => m.userId === userId).length;
  }
}
