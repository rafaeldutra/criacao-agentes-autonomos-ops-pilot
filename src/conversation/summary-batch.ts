export const SUMMARY_BATCH_SIZE = 8;

export type SummaryBatchSelection = {
  offset: number;
  limit: number;
};

/** Returns a batch of exactly `batchSize` when enough uncovered messages sit outside the raw window. */
export const selectSummaryBatch = (input: {
  totalMessages: number;
  coveredCount: number;
  windowSize?: number;
  batchSize?: number;
}): SummaryBatchSelection | undefined => {
  const windowSize = input.windowSize ?? SUMMARY_BATCH_SIZE;
  const batchSize = input.batchSize ?? SUMMARY_BATCH_SIZE;
  const { totalMessages, coveredCount } = input;
  if (!Number.isInteger(totalMessages) || totalMessages < 0) return undefined;
  if (!Number.isInteger(coveredCount) || coveredCount < 0) return undefined;
  if (totalMessages <= windowSize) return undefined;
  const uncoveredOutside = totalMessages - windowSize - coveredCount;
  if (uncoveredOutside < batchSize) return undefined;
  return { offset: coveredCount, limit: batchSize };
};
