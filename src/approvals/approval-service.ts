import { randomUUID } from "node:crypto";
import {
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
  ApprovalNotFoundError,
  DEFAULT_APPROVAL_TTL_MINUTES,
  isExpired,
  isSensitiveTool,
  type Approval,
  type ApprovalStatus,
  type ApprovalStore,
} from "../store/approval-store.js";
import type { Grant, PendingCall } from "./approval-gate.js";

export type Decision = "approve" | "deny";

/** Runs the real (ungated) tool as the user of the original request. */
export type ExecuteTool = (call: { tool: string; args: Record<string, unknown>; userId: string | null }) => Promise<unknown>;

/** Runs one agent turn in the approval's conversation with the given grants. */
export type RunTurn<T> = (message: string, grants: Grant[]) => Promise<T>;

export const FALLBACK_REASON = "O agente solicitou esta ação.";

/** Pure state transition; throws the domain error the HTTP edge translates to 409. */
export const applyDecision = (
  approval: Approval,
  decision: Decision,
  now: Date,
  ttlMinutes: number,
): "approved" | "denied" => {
  if (approval.status !== "pending") throw new ApprovalAlreadyDecidedError(approval);
  if (isExpired(approval, now, ttlMinutes)) throw new ApprovalExpiredError(approval);
  return decision === "approve" ? "approved" : "denied";
};

const serialize = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

export const buildDecisionMessage = (
  approval: Pick<Approval, "tool" | "args">,
  outcome: { status: ApprovalStatus; result: string | null },
): string => {
  const call = `${approval.tool} ${JSON.stringify(approval.args)}`;
  if (outcome.status === "denied") {
    return `[decisão] A pessoa operadora NEGOU ${call}. A ação não foi executada.`;
  }
  if (outcome.status === "failed") {
    return `[decisão] A pessoa operadora APROVOU ${call}, mas a execução falhou: ${outcome.result ?? "erro desconhecido"}.`;
  }
  return `[decisão] A pessoa operadora APROVOU ${call}. Resultado: ${outcome.result ?? ""}`;
};

export const buildResumeMessage = (originalMessage: string): string =>
  `Continue a solicitação original "${originalMessage}" considerando a decisão acima. ` +
  "Não repita a ação decidida.";

/** Reason shown on the card: the tool's `reason`, else the agent's last thought outside the context node. */
export const resolveReason = (
  pending: PendingCall,
  trace: ReadonlyArray<{ type: string; content?: unknown; node?: string }>,
): string => {
  if (pending.reason?.trim()) return pending.reason.trim();
  const thought = [...trace]
    .reverse()
    .find((event) => event.type === "thought" && event.node !== "context" && typeof event.content === "string" && event.content.trim());
  return typeof thought?.content === "string" ? thought.content.trim() : FALLBACK_REASON;
};

export type ApprovalServiceOptions = {
  approvals: ApprovalStore;
  executeTool: ExecuteTool;
  now?: () => Date;
  ttlMinutes?: number;
  newId?: () => string;
};

export const createApprovalService = (options: ApprovalServiceOptions) => {
  const now = options.now ?? (() => new Date());
  const ttlMinutes = options.ttlMinutes ?? DEFAULT_APPROVAL_TTL_MINUTES;
  const newId = options.newId ?? randomUUID;
  const { approvals } = options;

  const getOrThrow = (id: string): Approval => {
    const approval = approvals.get(id);
    if (!approval) throw new ApprovalNotFoundError(id);
    return approval;
  };

  return {
    ttlMinutes,
    now,

    get: getOrThrow,
    find: (id: string): Approval | undefined => approvals.get(id),

    createPending(input: {
      conversationId: string;
      requestId: string;
      userId?: string;
      pending: PendingCall;
      reason: string;
      originalMessage: string;
    }): Approval {
      if (!isSensitiveTool(input.pending.tool)) throw new Error(`Not a sensitive tool: ${input.pending.tool}`);
      return approvals.create({
        id: newId(),
        conversationId: input.conversationId,
        requestId: input.requestId,
        userId: input.userId,
        tool: input.pending.tool,
        args: input.pending.args,
        reason: input.reason,
        originalMessage: input.originalMessage,
        createdAt: now().toISOString(),
      });
    },

    /**
     * claim (single winner) → execute once if approved → record → resume the agent.
     * The decision is stored before the turn runs, so a failing turn never loses it.
     */
    async decide<T>(
      id: string,
      decision: Decision,
      context: { requestId: string; runTurn: RunTurn<T> },
    ): Promise<{ approval: Approval; turn: T }> {
      const approval = getOrThrow(id);
      const decided = applyDecision(approval, decision, now(), ttlMinutes);
      if (!approvals.claim(id, decided, now().toISOString())) {
        throw new ApprovalAlreadyDecidedError(getOrThrow(id));
      }

      let status: ApprovalStatus = decided;
      let result: string | null = null;
      if (decided === "approved") {
        try {
          result = serialize(await options.executeTool({ tool: approval.tool, args: approval.args, userId: approval.userId }));
        } catch (error) {
          status = "failed";
          result = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
      approvals.complete(id, { status, result, resumeRequestId: context.requestId });

      const grant: Grant = {
        tool: approval.tool,
        args: approval.args,
        outcome: decided,
        ...(result !== null ? { result } : {}),
      };
      const message = `${buildDecisionMessage(approval, { status, result })}\n\n${buildResumeMessage(approval.originalMessage)}`;
      const turn = await context.runTurn(message, [grant]);
      return { approval: getOrThrow(id), turn };
    },
  };
};

export type ApprovalService = ReturnType<typeof createApprovalService>;
