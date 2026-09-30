import {
  CONVERSATION_NOT_FOUND,
  DomainError,
  isMessageRole,
  type ConversationMessage,
  type ConversationStore,
  type ConversationSummaryRecord,
  type MessageRole,
} from "./conversation-store.js";

const newId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

type ConversationRecord = {
  id: string;
  createdAt: string;
  messages: ConversationMessage[];
  summary?: ConversationSummaryRecord;
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
    const conversation = this.require(conversationId);
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("limit must be a non-negative integer");
    }
    if (limit === 0) return [];
    return conversation.messages.slice(-limit).map((message) => ({ ...message }));
  }

  getSummary(conversationId: string): ConversationSummaryRecord | undefined {
    const conversation = this.require(conversationId);
    return conversation.summary ? { ...conversation.summary } : undefined;
  }

  upsertSummary(conversationId: string, summary: string, coveredCount: number): void {
    const conversation = this.require(conversationId);
    const text = summary.trim();
    if (!text) throw new Error("summary must not be empty");
    if (!Number.isInteger(coveredCount) || coveredCount < 0) {
      throw new Error("coveredCount must be a non-negative integer");
    }
    conversation.summary = {
      conversationId,
      summary: text,
      coveredCount,
      updatedAt: new Date().toISOString(),
    };
  }

  messageCount(conversationId: string): number {
    return this.require(conversationId).messages.length;
  }

  messagesAscending(conversationId: string, offset: number, limit: number): ConversationMessage[] {
    const conversation = this.require(conversationId);
    if (!Number.isInteger(offset) || offset < 0) throw new Error("offset must be a non-negative integer");
    if (!Number.isInteger(limit) || limit < 0) throw new Error("limit must be a non-negative integer");
    if (limit === 0) return [];
    return conversation.messages.slice(offset, offset + limit).map((message) => ({ ...message }));
  }

  close(): void {
    // no-op
  }

  private require(conversationId: string): ConversationRecord {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
    }
    return conversation;
  }
}
