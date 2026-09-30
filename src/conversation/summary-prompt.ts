/** Formats persisted conversation summary as a prompt prefix; empty when absent. */
export const formatSummaryBlock = (summary: string): string => {
  const text = summary.trim();
  if (!text) return "";
  return `[Conversation summary]\n${text}\n\n`;
};
