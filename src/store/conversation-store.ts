import { DomainError } from "./ops-store.js";

export type MessageRole = "user" | "assistant";

export type ConversationMessage = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
};

export interface ConversationStore {
  create(): string;
  append(conversationId: string, role: MessageRole, content: string): void;
  lastMessages(conversationId: string, limit: number): ConversationMessage[];
  exists(conversationId: string): boolean;
  close(): void;
}

export { DomainError };

export const CONVERSATION_NOT_FOUND = "CONVERSATION_NOT_FOUND";

export const isMessageRole = (value: string): value is MessageRole =>
  value === "user" || value === "assistant";
