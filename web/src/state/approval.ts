import type { UiError } from "../api/errors";
import type { Approval } from "../api/schemas";

export type ApprovalCardState =
  | "pending"
  | "submitting"
  | "approved"
  | "denied"
  | "failed"
  | "expired"
  | "error";

export type Decision = "approve" | "deny";

export interface ApprovalCard {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  createdAt: string;
  state: ApprovalCardState;
  decision?: Decision;
  decidedAt?: string;
  result?: string;
  error?: UiError;
}

export type ApprovalAction =
  | { type: "submit"; decision: Decision }
  | { type: "resolved"; approval: Approval }
  | { type: "expired"; approval?: Approval }
  | { type: "failed"; error: UiError };

const FINAL_STATES: ReadonlySet<ApprovalCardState> = new Set(["approved", "denied", "failed", "expired"]);

export function isFinalState(state: ApprovalCardState): boolean {
  return FINAL_STATES.has(state);
}

export function toApprovalCard(approval: Approval): ApprovalCard {
  return applyApproval(
    {
      id: approval.id,
      tool: approval.tool,
      args: approval.args,
      reason: approval.reason,
      createdAt: approval.createdAt,
      state: "pending",
    },
    approval,
  );
}

function applyApproval(card: ApprovalCard, approval: Approval): ApprovalCard {
  const next: ApprovalCard = { ...card, state: approval.status, error: undefined };
  if (approval.decidedAt) next.decidedAt = approval.decidedAt;
  if (approval.result) next.result = approval.result;
  return next;
}

/** Pure state machine of an approval card (data-model.md#approvalcard). */
export function approvalReducer(card: ApprovalCard, action: ApprovalAction): ApprovalCard {
  if (isFinalState(card.state)) return card;
  switch (action.type) {
    case "submit":
      if (card.state !== "pending" && card.state !== "error") return card;
      return { ...card, state: "submitting", decision: action.decision, error: undefined };
    case "resolved":
      if (action.approval.id !== card.id) return card;
      return applyApproval(card, action.approval);
    case "expired": {
      const base = action.approval ? applyApproval(card, action.approval) : card;
      return { ...base, state: "expired", error: undefined };
    }
    case "failed":
      if (card.state !== "submitting") return card;
      return { ...card, state: "error", error: action.error };
  }
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/** Human-readable sentence for a sensitive action. */
export function describeAction(tool: string, args: Record<string, unknown>): string {
  if (tool === "resolve_incident") {
    const id = stringArg(args, "id");
    return id ? `Resolver incidente ${id}` : "Resolver incidente";
  }
  if (tool === "forget_preference") {
    const preference = stringArg(args, "preference") ?? stringArg(args, "key") ?? stringArg(args, "fact");
    return preference ? `Esquecer preferência: ${preference}` : "Esquecer preferência";
  }
  return tool;
}

export const APPROVAL_STATE_LABELS: Record<ApprovalCardState, string> = {
  pending: "Aguardando sua decisão",
  submitting: "Enviando decisão…",
  approved: "Aprovado",
  denied: "Negado",
  failed: "Aprovado, mas a execução falhou",
  expired: "Expirado",
  error: "A decisão não foi registrada",
};
