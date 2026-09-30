import type { ConversationMessage } from "../store/conversation-store.js";

export const HISTORY_WINDOW = 8;

/** Formats prior messages oldest→newest within the window (no current message). */
export const formatHistoryOnly = (history: readonly ConversationMessage[]): string => {
  const windowed = history.slice(-HISTORY_WINDOW);
  return windowed.map((message) => `${message.role}: ${message.content}`).join("\n");
};

/** Formats prior messages oldest→newest, then the current user message. */
export const formatChatHistory = (
  history: readonly ConversationMessage[],
  currentMessage: string,
): string => {
  const prior = formatHistoryOnly(history);
  const current = `user: ${currentMessage}`;
  return prior ? `${prior}\n${current}` : current;
};

export const composeStrategyInput = (
  history: readonly ConversationMessage[],
  currentMessage: string,
): string => formatChatHistory(history, currentMessage);
