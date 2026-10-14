import { describe, expect, it } from "vitest";
import { toUiError } from "../api/errors";
import { approvalSchema } from "../api/schemas";
import { chat202, decision409, decisionApprove200 } from "../test/fixtures";
import { approvalReducer, describeAction, toApprovalCard, type ApprovalCard } from "./approval";

const pendingCard = (): ApprovalCard => toApprovalCard(approvalSchema.parse(chat202().approval));
const networkError = toUiError({ kind: "network" });

describe("approvalReducer", () => {
  it("pending → submitting → approved", () => {
    const submitting = approvalReducer(pendingCard(), { type: "submit", decision: "approve" });
    expect(submitting).toMatchObject({ state: "submitting", decision: "approve" });
    const approved = approvalReducer(submitting, {
      type: "resolved",
      approval: approvalSchema.parse(decisionApprove200().approval),
    });
    expect(approved).toMatchObject({ state: "approved", decidedAt: "2026-10-14T12:01:30.000Z" });
  });

  it("pending → submitting → denied", () => {
    const submitting = approvalReducer(pendingCard(), { type: "submit", decision: "deny" });
    const denied = approvalReducer(submitting, {
      type: "resolved",
      approval: { ...approvalSchema.parse(chat202().approval), status: "denied", decidedAt: "2026-10-14T12:01:00.000Z" },
    });
    expect(denied.state).toBe("denied");
  });

  it("409 already decided → final state read from GET /approvals/:id", () => {
    const submitting = approvalReducer(pendingCard(), { type: "submit", decision: "approve" });
    const final = approvalReducer(submitting, { type: "resolved", approval: approvalSchema.parse(decision409().approval) });
    expect(final).toMatchObject({ state: "denied", decidedAt: "2026-10-14T12:01:00.000Z" });
  });

  it("409 expired → expired", () => {
    const submitting = approvalReducer(pendingCard(), { type: "submit", decision: "approve" });
    expect(approvalReducer(submitting, { type: "expired" }).state).toBe("expired");
  });

  it("network/5xx → error → retry → submitting", () => {
    const submitting = approvalReducer(pendingCard(), { type: "submit", decision: "approve" });
    const failed = approvalReducer(submitting, { type: "failed", error: networkError });
    expect(failed).toMatchObject({ state: "error", error: networkError });
    const retried = approvalReducer(failed, { type: "submit", decision: "approve" });
    expect(retried.state).toBe("submitting");
    expect(retried.error).toBeUndefined();
  });

  it("decided cards ignore further actions", () => {
    const denied = approvalReducer(approvalReducer(pendingCard(), { type: "submit", decision: "deny" }), {
      type: "resolved",
      approval: approvalSchema.parse(decision409().approval),
    });
    expect(approvalReducer(denied, { type: "submit", decision: "approve" })).toBe(denied);
    expect(approvalReducer(denied, { type: "failed", error: networkError })).toBe(denied);
  });

  it("ignores a second submit while submitting and failures when not submitting", () => {
    const submitting = approvalReducer(pendingCard(), { type: "submit", decision: "approve" });
    expect(approvalReducer(submitting, { type: "submit", decision: "deny" })).toBe(submitting);
    const pending = pendingCard();
    expect(approvalReducer(pending, { type: "failed", error: networkError })).toBe(pending);
  });
});

describe("describeAction", () => {
  it("describes sensitive actions in plain language", () => {
    expect(describeAction("resolve_incident", { id: "inc-123" })).toBe("Resolver incidente inc-123");
    expect(describeAction("forget_preference", { preference: "tema escuro" })).toBe("Esquecer preferência: tema escuro");
    expect(describeAction("forget_preference", {})).toBe("Esquecer preferência");
    expect(describeAction("other_tool", {})).toBe("other_tool");
  });
});
