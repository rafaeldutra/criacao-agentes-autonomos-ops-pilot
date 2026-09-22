import type { ConversationMessage } from "../store/conversation-store.js";

export const HISTORY_WINDOW = 12;

/** Formats prior messages oldest→newest, then the current user message. */
export const formatChatHistory = (
  history: readonly ConversationMessage[],
  currentMessage: string,
): string => {
  const windowed = history.slice(-HISTORY_WINDOW);
  const lines = windowed.map((message) => `${message.role}: ${message.content}`);
  lines.push(`user: ${currentMessage}`);
  return lines.join("\n");
};

export const composeStrategyInput = (
  history: readonly ConversationMessage[],
  currentMessage: string,
): string => formatChatHistory(history, currentMessage);
