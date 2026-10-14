import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDecision,
  buildDecisionMessage,
  buildResumeMessage,
  createApprovalService,
  FALLBACK_REASON,
  resolveReason,
  type ExecuteTool,
} from "./approval-service.js";
import type { Grant } from "./approval-gate.js";
import {
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
  ApprovalNotFoundError,
  type Approval,
} from "../store/approval-store.js";
import { FakeApprovalStore } from "../store/fake-approval-store.js";

const T0 = new Date("2026-10-14T12:00:00.000Z");

const pendingApproval = (overrides: Partial<Approval> = {}): Approval => ({
  id: "a-1",
  conversationId: "c-1",
  requestId: "r-1",
  userId: "u-1",
  tool: "resolve_incident",
  args: { id: "inc-1" },
  reason: "stable",
  originalMessage: "resolve checkout",
  status: "pending",
  createdAt: T0.toISOString(),
  decidedAt: null,
  result: null,
  resumeRequestId: null,
  ...overrides,
});

test("applyDecision maps approve/deny and rejects decided or expired approvals", () => {
  assert.equal(applyDecision(pendingApproval(), "approve", T0, 60), "approved");
  assert.equal(applyDecision(pendingApproval(), "deny", T0, 60), "denied");
  assert.throws(() => applyDecision(pendingApproval({ status: "denied" }), "approve", T0, 60), ApprovalAlreadyDecidedError);
  assert.throws(
    () => applyDecision(pendingApproval(), "approve", new Date(T0.getTime() + 61 * 60_000), 60),
    ApprovalExpiredError,
  );
});

test("buildDecisionMessage and buildResumeMessage describe the decision for the agent", () => {
  const approval = { tool: "resolve_incident" as const, args: { id: "inc-1" } };
  assert.match(buildDecisionMessage(approval, { status: "approved", result: "ok" }), /^\[decisão\] .*APROVOU resolve_incident \{"id":"inc-1"\}\. Resultado: ok$/);
  assert.match(buildDecisionMessage(approval, { status: "denied", result: null }), /NEGOU .*não foi executada/);
  assert.match(buildDecisionMessage(approval, { status: "failed", result: "boom" }), /falhou: boom/);
  assert.match(buildResumeMessage("resolve checkout"), /"resolve checkout"/);
});

test("resolveReason prefers the tool reason, then the last non-context thought, then a fallback", () => {
  const trace = [
    { type: "thought", content: "context built", node: "context" },
    { type: "thought", content: "metrics look stable", node: "react" },
  ];
  assert.equal(resolveReason({ tool: "resolve_incident", args: {}, reason: " r " }, trace), "r");
  assert.equal(resolveReason({ tool: "resolve_incident", args: {} }, trace), "metrics look stable");
  assert.equal(resolveReason({ tool: "resolve_incident", args: {} }, [trace[0]!]), FALLBACK_REASON);
});

const setup = (executeTool: ExecuteTool) => {
  const approvals = new FakeApprovalStore();
  let clock = T0;
  const service = createApprovalService({
    approvals,
    executeTool,
    now: () => clock,
    ttlMinutes: 60,
    newId: () => "a-1",
  });
  const approval = service.createPending({
    conversationId: "c-1",
    requestId: "r-1",
    userId: "u-1",
    pending: { tool: "resolve_incident", args: { id: "inc-1" } },
    reason: "stable",
    originalMessage: "resolve checkout",
  });
  return { approvals, service, approval, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
};

test("approve executes the tool exactly once as the original user and resumes with an approved grant", async () => {
  const calls: unknown[] = [];
  const { service } = setup(async (call) => {
    calls.push(call);
    return { id: "inc-1", status: "resolved" };
  });
  const turns: Array<{ message: string; grants: Grant[] }> = [];
  const { approval, turn } = await service.decide("a-1", "approve", {
    requestId: "r-2",
    runTurn: async (message, grants) => {
      turns.push({ message, grants });
      return "final";
    },
  });
  assert.deepEqual(calls, [{ tool: "resolve_incident", args: { id: "inc-1" }, userId: "u-1" }]);
  assert.equal(turn, "final");
  assert.equal(approval.status, "approved");
  assert.equal(approval.result, "{\"id\":\"inc-1\",\"status\":\"resolved\"}");
  assert.equal(approval.resumeRequestId, "r-2");
  assert.equal(approval.decidedAt, T0.toISOString());
  assert.deepEqual(turns[0]?.grants, [
    { tool: "resolve_incident", args: { id: "inc-1" }, outcome: "approved", result: "{\"id\":\"inc-1\",\"status\":\"resolved\"}" },
  ]);
  assert.match(turns[0]?.message ?? "", /^\[decisão\] .*APROVOU[\s\S]*Continue a solicitação original "resolve checkout"/);
});

test("deny never executes the tool and resumes with a denied grant", async () => {
  let executed = 0;
  const { service } = setup(async () => {
    executed += 1;
    return "x";
  });
  let grants: Grant[] = [];
  const { approval } = await service.decide("a-1", "deny", {
    requestId: "r-2",
    runTurn: async (_message, given) => {
      grants = given;
    },
  });
  assert.equal(executed, 0);
  assert.equal(approval.status, "denied");
  assert.equal(approval.result, null);
  assert.deepEqual(grants, [{ tool: "resolve_incident", args: { id: "inc-1" }, outcome: "denied" }]);
});

test("a throwing tool marks the approval failed and still resumes the agent", async () => {
  const { service } = setup(async () => {
    throw new Error("incident locked");
  });
  let resumed = "";
  const { approval } = await service.decide("a-1", "approve", {
    requestId: "r-2",
    runTurn: async (message) => {
      resumed = message;
    },
  });
  assert.equal(approval.status, "failed");
  assert.equal(approval.result, "Tool execution failed: incident locked");
  assert.match(resumed, /falhou: Tool execution failed: incident locked/);
});

test("concurrent approvals execute the tool once; the loser gets ApprovalAlreadyDecidedError", async () => {
  let executed = 0;
  const { service } = setup(async () => {
    executed += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return "ok";
  });
  const runTurn = async () => "done";
  const results = await Promise.allSettled([
    service.decide("a-1", "approve", { requestId: "r-2", runTurn }),
    service.decide("a-1", "approve", { requestId: "r-3", runTurn }),
  ]);
  assert.equal(executed, 1);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ApprovalAlreadyDecidedError);
});

test("decide rejects unknown, already decided and expired approvals without side effects", async () => {
  let executed = 0;
  const { service, advance } = setup(async () => {
    executed += 1;
    return "ok";
  });
  const runTurn = async () => "done";
  await assert.rejects(service.decide("missing", "approve", { requestId: "r-2", runTurn }), ApprovalNotFoundError);
  advance(61 * 60_000);
  await assert.rejects(service.decide("a-1", "approve", { requestId: "r-2", runTurn }), ApprovalExpiredError);
  assert.equal(executed, 0);
  assert.equal(service.get("a-1").status, "pending");
});

test("the decision is stored even when the resumed turn fails", async () => {
  const { service } = setup(async () => "ok");
  await assert.rejects(
    service.decide("a-1", "approve", {
      requestId: "r-2",
      runTurn: async () => {
        throw new Error("model down");
      },
    }),
    /model down/,
  );
  const stored = service.get("a-1");
  assert.equal(stored.status, "approved");
  assert.equal(stored.resumeRequestId, "r-2");
});
