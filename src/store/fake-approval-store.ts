import {
  assertApprovalInput,
  type Approval,
  type ApprovalInput,
  type ApprovalStatus,
  type ApprovalStore,
} from "./approval-store.js";

/** In-memory double with the same semantics as SqliteApprovalStore (single-winner claim). */
export class FakeApprovalStore implements ApprovalStore {
  private readonly rows = new Map<string, Approval>();

  create(input: ApprovalInput): Approval {
    assertApprovalInput(input);
    if (this.rows.has(input.id)) throw new Error(`Duplicate approval id: ${input.id}`);
    const approval: Approval = {
      id: input.id,
      conversationId: input.conversationId,
      requestId: input.requestId,
      userId: input.userId ?? null,
      tool: input.tool,
      args: structuredClone(input.args),
      reason: input.reason,
      originalMessage: input.originalMessage,
      status: "pending",
      createdAt: input.createdAt,
      decidedAt: null,
      result: null,
      resumeRequestId: null,
    };
    this.rows.set(approval.id, approval);
    return structuredClone(approval);
  }

  get(id: string): Approval | undefined {
    const row = this.rows.get(id);
    return row ? structuredClone(row) : undefined;
  }

  findPending(conversationId: string, createdAfter: string): Approval | undefined {
    const matches = [...this.rows.values()]
      .filter((row) => row.conversationId === conversationId && row.status === "pending" && row.createdAt >= createdAfter)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return matches[0] ? structuredClone(matches[0]) : undefined;
  }

  claim(id: string, status: "approved" | "denied", decidedAt: string): boolean {
    const row = this.rows.get(id);
    if (!row || row.status !== "pending") return false;
    row.status = status;
    row.decidedAt = decidedAt;
    return true;
  }

  complete(id: string, update: { status: ApprovalStatus; result: string | null; resumeRequestId: string }): void {
    const row = this.rows.get(id);
    if (!row || row.status === "pending") return;
    row.status = update.status;
    row.result = update.result;
    row.resumeRequestId = update.resumeRequestId;
  }

  close(): void {}
}
