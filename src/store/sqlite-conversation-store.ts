import { DatabaseSync } from "node:sqlite";
import {
  CONVERSATION_NOT_FOUND,
  DomainError,
  isMessageRole,
  type ConversationMessage,
  type ConversationStore,
  type MessageRole,
} from "./conversation-store.js";

const DEFAULT_PATH = "./data/opspilot.db";

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at);
`;

const newId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export class SqliteConversationStore implements ConversationStore {
  readonly db: DatabaseSync;

  constructor(path = process.env.OPSPILOT_DB || DEFAULT_PATH) {
    if (!path.trim()) throw new Error("OPSPILOT_DB must not be empty");
    this.db = new DatabaseSync(path);
    this.db.exec(schema);
  }

  create(): string {
    const id = newId("conv");
    const createdAt = new Date().toISOString();
    this.db.prepare("INSERT INTO conversations (id, created_at) VALUES (?, ?)").run(id, createdAt);
    return id;
  }

  exists(conversationId: string): boolean {
    const row = this.db.prepare("SELECT 1 AS ok FROM conversations WHERE id = ?").get(conversationId) as
      | { ok: number }
      | undefined;
    return Boolean(row);
  }

  append(conversationId: string, role: MessageRole, content: string): void {
    if (!this.exists(conversationId)) {
      throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
    }
    if (!isMessageRole(role)) {
      throw new Error(`Invalid message role: ${role}`);
    }
    const id = newId("msg");
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, conversationId, role, content, createdAt);
  }

  lastMessages(conversationId: string, limit: number): ConversationMessage[] {
    if (!this.exists(conversationId)) {
      throw new DomainError(`Conversation not found: ${conversationId}`, CONVERSATION_NOT_FOUND);
    }
    if (!Number.isInteger(limit) || limit < 0) {
      throw new Error("limit must be a non-negative integer");
    }
    if (limit === 0) return [];

    const rows = this.db
      .prepare(
        `SELECT id, conversation_id, role, content, created_at
         FROM (
           SELECT id, conversation_id, role, content, created_at, rowid
           FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC, rowid DESC
           LIMIT ?
         )
         ORDER BY created_at ASC, rowid ASC`,
      )
      .all(conversationId, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => this.message(row));
  }

  close(): void {
    this.db.close();
  }

  private message(row: Record<string, unknown>): ConversationMessage {
    const role = String(row.role);
    if (!isMessageRole(role)) throw new Error(`Invalid stored role: ${role}`);
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      role,
      content: String(row.content),
      createdAt: String(row.created_at),
    };
  }
}
