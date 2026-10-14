import { DatabaseSync } from "node:sqlite";
import {
  assertApprovalInput,
  type Approval,
  type ApprovalInput,
  type ApprovalStatus,
  type ApprovalStore,
  type SensitiveTool,
} from "./approval-store.js";

const DEFAULT_PATH = "./data/opspilot.db";

const schema = `
CREATE TABLE IF NOT EXISTS approvals (
  id                TEXT PRIMARY KEY,
  conversation_id   TEXT NOT NULL,
  request_id        TEXT NOT NULL,
  user_id           TEXT,
  tool              TEXT NOT NULL CHECK (tool IN ('resolve_incident', 'forget_preference')),
  args              TEXT NOT NULL,
  reason            TEXT NOT NULL,
  original_message  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'denied', 'failed')),
  created_at        TEXT NOT NULL,
  decided_at        TEXT,
  result            TEXT,
  resume_request_id TEXT,
  CHECK (status = 'pending' OR decided_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_approvals_conversation_status
  ON approvals(conversation_id, status);
`;

const stringOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

const toApproval = (row: Record<string, unknown>): Approval => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  requestId: String(row.request_id),
  userId: stringOrNull(row.user_id),
  tool: String(row.tool) as SensitiveTool,
  args: JSON.parse(String(row.args)) as Record<string, unknown>,
  reason: String(row.reason),
  originalMessage: String(row.original_message),
  status: String(row.status) as ApprovalStatus,
  createdAt: String(row.created_at),
  decidedAt: stringOrNull(row.decided_at),
  result: stringOrNull(row.result),
  resumeRequestId: stringOrNull(row.resume_request_id),
});

export class SqliteApprovalStore implements ApprovalStore {
  readonly db: DatabaseSync;

  constructor(path = process.env.OPSPILOT_DB || DEFAULT_PATH) {
    if (!path.trim()) throw new Error("OPSPILOT_DB must not be empty");
    this.db = new DatabaseSync(path);
    this.db.exec(schema);
  }

  create(input: ApprovalInput): Approval {
    assertApprovalInput(input);
    this.db
      .prepare(
        `INSERT INTO approvals (id, conversation_id, request_id, user_id, tool, args, reason, original_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.conversationId,
        input.requestId,
        input.userId ?? null,
        input.tool,
        JSON.stringify(input.args),
        input.reason,
        input.originalMessage,
        input.createdAt,
      );
    const created = this.get(input.id);
    if (!created) throw new Error(`Approval not persisted: ${input.id}`);
    return created;
  }

  get(id: string): Approval | undefined {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? toApproval(row) : undefined;
  }

  findPending(conversationId: string, createdAfter: string): Approval | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM approvals
         WHERE conversation_id = ? AND status = 'pending' AND created_at >= ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(conversationId, createdAfter) as Record<string, unknown> | undefined;
    return row ? toApproval(row) : undefined;
  }

  claim(id: string, status: "approved" | "denied", decidedAt: string): boolean {
    const result = this.db
      .prepare("UPDATE approvals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'")
      .run(status, decidedAt, id);
    return Number(result.changes) === 1;
  }

  complete(id: string, update: { status: ApprovalStatus; result: string | null; resumeRequestId: string }): void {
    this.db
      .prepare("UPDATE approvals SET status = ?, result = ?, resume_request_id = ? WHERE id = ? AND status <> 'pending'")
      .run(update.status, update.result, update.resumeRequestId, id);
  }

  close(): void {
    this.db.close();
  }
}
