export const DEDUP_THRESHOLD = 0.92;
export const RECALL_MIN_SCORE = 0.3;
export const RECALL_TOP_K = 3;

export const dotProduct = (a: Float32Array, b: Float32Array): number => {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += a[i]! * b[i]!;
  }
  return sum;
};

export type ScoredItem<T> = T & { score: number };

/** Filter by min score, sort desc by score, take top k — matches recall semantics. */
export const topkByScore = <T extends { score: number }>(
  items: readonly T[],
  k = RECALL_TOP_K,
  minScore = RECALL_MIN_SCORE,
): T[] =>
  [...items]
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

export type DedupCandidate = { id: string; embedding: Float32Array };

/** Returns the best match above dedup threshold, or undefined. */
export const findDedupMatch = (
  query: Float32Array,
  candidates: readonly DedupCandidate[],
  threshold = DEDUP_THRESHOLD,
): { id: string; score: number } | undefined => {
  let best: { id: string; score: number } | undefined;
  for (const candidate of candidates) {
    const score = dotProduct(query, candidate.embedding);
    if (score > threshold && (!best || score > best.score)) {
      best = { id: candidate.id, score };
    }
  }
  return best;
};
