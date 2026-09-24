import { DatabaseSync } from "node:sqlite";
import {
  DEDUP_THRESHOLD,
  RECALL_MIN_SCORE,
  RECALL_TOP_K,
  findDedupMatch,
  topkByScore,
} from "./memory-ranking.js";
import type { EmbedFn, MemoryStore, RecalledMemory, RememberResult } from "./memory-store.js";

const DEFAULT_PATH = "./data/opspilot.db";
const EMBEDDING_DIM = 384;

const schema = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fact TEXT NOT NULL,
  embedding BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON memories(user_id);
`;

const newId = (): string => `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const vectorToBlob = (vector: Float32Array): Buffer => Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);

export const blobToVector = (blob: Buffer | Uint8Array): Float32Array => {
  const copy = Buffer.from(blob);
  if (copy.byteLength % 4 !== 0) {
    throw new Error(`Invalid embedding blob length: ${copy.byteLength}`);
  }
  return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
};

export type SqliteMemoryStoreOptions = {
  path?: string;
  embed: EmbedFn;
};

export class SqliteMemoryStore implements MemoryStore {
  readonly db: DatabaseSync;
  private readonly embed: EmbedFn;

  constructor(options: SqliteMemoryStoreOptions) {
    const path = options.path ?? process.env.OPSPILOT_DB ?? DEFAULT_PATH;
    if (!path.trim()) throw new Error("OPSPILOT_DB must not be empty");
    this.embed = options.embed;
    this.db = new DatabaseSync(path);
    this.db.exec(schema);
  }

  async remember(userId: string, fact: string): Promise<RememberResult> {
    const uid = userId.trim();
    const text = fact.trim();
    if (!uid) throw new Error("userId must not be empty");
    if (!text) throw new Error("fact must not be empty");

    const vector = await this.embed(text);
    this.assertDim(vector);

    const existing = this.loadUserMemories(uid);
    const dedup = findDedupMatch(vector, existing, DEDUP_THRESHOLD);
    if (dedup) {
      return { id: dedup.id, created: false };
    }

    const id = newId();
    const createdAt = new Date().toISOString();
    this.db
      .prepare("INSERT INTO memories (id, user_id, fact, embedding, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, uid, text, vectorToBlob(vector), createdAt);
    return { id, created: true };
  }

  async recall(userId: string, query: string): Promise<RecalledMemory[]> {
    const uid = userId.trim();
    const text = query.trim();
    if (!uid) throw new Error("userId must not be empty");
    if (!text) throw new Error("query must not be empty");

    const q = await this.embed(text);
    this.assertDim(q);

    // Reference: data/example.ts — embed query, score all user memories, sort, top-k, min score.
    const scored = this.loadUserMemories(uid).map((row) => ({
      id: row.id,
      fact: row.fact,
      score: row.scoreDot(q),
    }));

    return topkByScore(scored, RECALL_TOP_K, RECALL_MIN_SCORE);
  }

  forget(id: string): void {
    this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  }

  close(): void {
    this.db.close();
  }

  private assertDim(vector: Float32Array): void {
    if (vector.length !== EMBEDDING_DIM) {
      throw new Error(`Expected embedding dim ${EMBEDDING_DIM}, got ${vector.length}`);
    }
  }

  private loadUserMemories(userId: string): Array<{
    id: string;
    fact: string;
    embedding: Float32Array;
    scoreDot: (q: Float32Array) => number;
  }> {
    const rows = this.db
      .prepare("SELECT id, fact, embedding FROM memories WHERE user_id = ?")
      .all(userId) as Array<{ id: string; fact: string; embedding: Buffer }>;

    return rows.map((row) => {
      const embedding = blobToVector(row.embedding);
      return {
        id: String(row.id),
        fact: String(row.fact),
        embedding,
        scoreDot: (q: Float32Array) => {
          let sum = 0;
          for (let i = 0; i < q.length; i += 1) sum += q[i]! * embedding[i]!;
          return sum;
        },
      };
    });
  }
}
