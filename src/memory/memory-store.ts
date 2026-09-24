export type EmbedFn = (text: string) => Promise<Float32Array>;

export type RememberResult = {
  id: string;
  created: boolean;
};

export type RecalledMemory = {
  id: string;
  fact: string;
  score: number;
};

export interface MemoryStore {
  remember(userId: string, fact: string): Promise<RememberResult>;
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
  forget(id: string): void;
  close(): void;
}
