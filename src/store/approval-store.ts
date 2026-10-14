import { DomainError } from "./ops-store.js";

/** Tools that never run over HTTP without a human decision. */
export const SENSITIVE_TOOLS = ["resolve_incident", "forget_preference"] as const;
export type SensitiveTool = (typeof SENSITIVE_TOOLS)[number];

export const isSensitiveTool = (name: string): name is SensitiveTool =>
  (SENSITIVE_TOOLS as readonly string[]).includes(name);

export type ApprovalStatus = "pending" | "approved" | "denied" | "failed";
/** `expired` is derived on read (pending past the TTL), never stored. */
export type ApprovalViewStatus = ApprovalStatus | "expired";

export type Approval = {
  id: string;
  conversationId: string;
  requestId: string;
  userId: string | null;
  tool: SensitiveTool;
  /** Tool arguments without `reason`. */
  args: Record<string, unknown>;
  reason: string;
  originalMessage: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt: string | null;
  result: string | null;
  resumeRequestId: string | null;
};

export type ApprovalInput = {
  id: string;
  conversationId: string;
  requestId: string;
  userId?: string;
  tool: SensitiveTool;
  args: Record<string, unknown>;
  reason: string;
  originalMessage: string;
  createdAt: string;
};

/** What HTTP clients see (contracts/approvals-http.md). */
export type ApprovalView = Omit<Approval, "userId" | "originalMessage" | "status"> & {
  status: ApprovalViewStatus;
};

export interface ApprovalStore {
  create(input: ApprovalInput): Approval;
  get(id: string): Approval | undefined;
  /** Newest pending approval of the conversation created at or after `createdAfter` (ISO). */
  findPending(conversationId: string, createdAfter: string): Approval | undefined;
  /** Atomic pending → decided; false when it was no longer pending (nothing changes). */
  claim(id: string, status: "approved" | "denied", decidedAt: string): boolean;
  /** Final state after the decision: execution result and the request that resumed the agent. */
  complete(id: string, update: { status: ApprovalStatus; result: string | null; resumeRequestId: string }): void;
  close(): void;
}

export const APPROVAL_NOT_FOUND = "APPROVAL_NOT_FOUND";
export const APPROVAL_ALREADY_DECIDED = "APPROVAL_ALREADY_DECIDED";
export const APPROVAL_EXPIRED = "APPROVAL_EXPIRED";
export const APPROVAL_PENDING = "APPROVAL_PENDING";

export const DEFAULT_APPROVAL_TTL_MINUTES = 1440;

export class ApprovalNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Approval not found: ${id}`, APPROVAL_NOT_FOUND);
  }
}

export class ApprovalAlreadyDecidedError extends DomainError {
  constructor(readonly approval: Approval) {
    super("Approval already decided", APPROVAL_ALREADY_DECIDED);
  }
}

export class ApprovalExpiredError extends DomainError {
  constructor(readonly approval: Approval) {
    super("Approval expired", APPROVAL_EXPIRED);
  }
}

export class ApprovalPendingError extends DomainError {
  constructor(readonly approval: Approval) {
    super("Conversation has a pending approval", APPROVAL_PENDING);
  }
}

export const expiryCutoff = (now: Date, ttlMinutes: number): string =>
  new Date(now.getTime() - ttlMinutes * 60_000).toISOString();

export const isExpired = (approval: Approval, now: Date, ttlMinutes: number): boolean =>
  approval.status === "pending" && approval.createdAt < expiryCutoff(now, ttlMinutes);

export const toApprovalView = (approval: Approval, now: Date, ttlMinutes: number): ApprovalView => {
  const { userId: _userId, originalMessage: _originalMessage, ...rest } = approval;
  return { ...rest, status: isExpired(approval, now, ttlMinutes) ? "expired" : approval.status };
};

/** TTL from OPSPILOT_APPROVAL_TTL_MINUTES; positive integer, default 24h. */
export const loadApprovalTtlMinutes = (env: NodeJS.ProcessEnv): number => {
  const raw = env.OPSPILOT_APPROVAL_TTL_MINUTES?.trim();
  if (!raw) return DEFAULT_APPROVAL_TTL_MINUTES;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`OPSPILOT_APPROVAL_TTL_MINUTES must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return value;
};

/** Shared write validation so the fake mirrors the SQLite constraints. */
export const assertApprovalInput = (input: ApprovalInput): void => {
  if (!isSensitiveTool(input.tool)) throw new Error(`Not a sensitive tool: ${input.tool}`);
  if (!input.id || !input.conversationId || !input.requestId) throw new Error("Approval ids must not be empty");
  if (!input.reason.trim()) throw new Error("Approval reason must not be empty");
};

export { DomainError };
