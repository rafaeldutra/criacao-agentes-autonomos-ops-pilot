import {
  CONVERSATION_NOT_FOUND,
  DomainError,
  isMessageRole,
  type ConversationMessage,
  type ConversationStore,
  type MessageRole,
} from "./conversation-store.js";

const newId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type ConversationRecord = {
  id: string;
  createdAt: string;
  messages: ConversationMessage[];
};

export class FakeConversationStore implements ConversationStore {
  private readonly conversations = new Map<string, ConversationRecord>();

  create(): string {
    const id = newId("conv");
    this.conversations.set(id, { id, createdAt: new Date().toISOString(), messages: [] });
    return id;
  }

  exists(conversationId: string): boolean {
    return this.conversations.has(conversationId);
  }

  append(conversationId: string, role: MessageRole, content: string): void {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
    }
    if (!isMessageRole(role)) {
      throw new Error(`Invalid message role: ${role}`);
    }
    conversation.messages.push({
      id: newId("msg"),
      conversationId,
      role,
      content,
      createdAt: new Date().toISOString(),
    });
  }

  lastMessages(conversationId: string, limit: number): ConversationMessage[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
    }
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("limit must be a non-negative integer");
    }
    if (limit === 0) return [];
    return conversation.messages.slice(-limit).map((message) => ({ ...message }));
  }

  close(): void {
    // no-op
  }
}
