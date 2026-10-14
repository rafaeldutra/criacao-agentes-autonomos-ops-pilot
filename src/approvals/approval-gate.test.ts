import test from "node:test";
import assert from "node:assert/strict";
import {
  APPROVAL_REQUIRED_OBSERVATION,
  canonicalArgs,
  createApprovalContext,
  decideGate,
  DENIED_OBSERVATION,
  runWithApprovalContext,
  splitReason,
  withApprovalGate,
} from "./approval-gate.js";
import { createTools } from "../agents/tools.js";
import { createSeededStore } from "../agents/store.js";

test("decideGate executes outside any approval context", () => {
  assert.deepEqual(decideGate(undefined, { tool: "resolve_incident", args: { id: "inc-1" } }), { kind: "execute" });
});

test("decideGate holds without a grant and marks only the first hold", () => {
  const context = createApprovalContext();
  assert.deepEqual(decideGate(context, { tool: "resolve_incident", args: { id: "inc-1" } }), { kind: "hold", first: true });
  context.pending = { tool: "resolve_incident", args: { id: "inc-1" } };
  assert.deepEqual(decideGate(context, { tool: "forget_preference", args: { preference: "x" } }), { kind: "hold", first: false });
});

test("decideGate replays approved grants and denies denied ones, matching canonical args", () => {
  const context = createApprovalContext([
    { tool: "resolve_incident", args: { summary: "ok", id: "inc-1" }, outcome: "approved", result: "{\"status\":\"resolved\"}" },
    { tool: "forget_preference", args: { preference: "dark mode" }, outcome: "denied" },
  ]);
  assert.deepEqual(
    decideGate(context, { tool: "resolve_incident", args: { id: "inc-1", summary: "ok", reason: "different words" } }),
    { kind: "replay", result: "{\"status\":\"resolved\"}" },
  );
  assert.deepEqual(decideGate(context, { tool: "forget_preference", args: { preference: "dark mode" } }), { kind: "deny" });
  assert.deepEqual(decideGate(context, { tool: "resolve_incident", args: { id: "inc-2" } }), { kind: "hold", first: true });
});

test("canonicalArgs ignores key order, undefined values and reason", () => {
  assert.equal(canonicalArgs({ b: 1, a: { d: 2, c: 3 } }), canonicalArgs({ a: { c: 3, d: 2 }, b: 1, reason: "x" }));
  assert.equal(canonicalArgs({ id: "inc-1", summary: undefined }), canonicalArgs({ id: "inc-1" }));
});

test("splitReason separates a non-empty reason from the tool arguments", () => {
  assert.deepEqual(splitReason({ id: "inc-1", reason: "  stable  " }), { args: { id: "inc-1" }, reason: "stable" });
  assert.deepEqual(splitReason({ id: "inc-1", reason: " " }), { args: { id: "inc-1" } });
});

test("withApprovalGate holds the first call without running the tool and records it as pending", async () => {
  let calls = 0;
  const gated = withApprovalGate("resolve_incident", () => {
    calls += 1;
    return "done";
  });
  const context = createApprovalContext();
  const first = await runWithApprovalContext(context, () => gated({ id: "inc-1", reason: "stable" }));
  const second = await runWithApprovalContext(context, () => gated({ id: "inc-2" }));
  assert.equal(calls, 0);
  assert.equal(first, APPROVAL_REQUIRED_OBSERVATION("resolve_incident"));
  assert.equal(second, APPROVAL_REQUIRED_OBSERVATION("resolve_incident"));
  assert.deepEqual(context.pending, { tool: "resolve_incident", args: { id: "inc-1" }, reason: "stable" });
  assert.deepEqual(context.held, [
    { tool: "resolve_incident", args: { id: "inc-1" } },
    { tool: "resolve_incident", args: { id: "inc-2" } },
  ]);
});

test("withApprovalGate replays and denies without running the tool", async () => {
  let calls = 0;
  const gated = withApprovalGate("resolve_incident", () => {
    calls += 1;
    return "done";
  });
  const approved = createApprovalContext([{ tool: "resolve_incident", args: { id: "inc-1" }, outcome: "approved", result: "stored" }]);
  assert.equal(await runWithApprovalContext(approved, () => gated({ id: "inc-1" })), "stored");
  const denied = createApprovalContext([{ tool: "resolve_incident", args: { id: "inc-1" }, outcome: "denied" }]);
  assert.equal(await runWithApprovalContext(denied, () => gated({ id: "inc-1" })), DENIED_OBSERVATION("resolve_incident"));
  assert.equal(calls, 0);
  assert.equal(await gated({ id: "inc-1" }), "done", "outside a context the tool runs");
  assert.equal(calls, 1);
});

test("createTools gates only resolve_incident and forget_preference", async () => {
  const store = createSeededStore();
  const tools = createTools(store);
  const incidentId = store.openIncident("Checkout slow", "checkout", "high").id;
  const context = createApprovalContext();

  await runWithApprovalContext(context, async () => {
    const observation = await tools.resolveIncident.invoke({ id: incidentId, reason: "stable" });
    assert.equal(observation, APPROVAL_REQUIRED_OBSERVATION("resolve_incident"));
    await tools.forgetPreference.invoke({ preference: "dark mode" });
    const opened = await tools.openIncident.invoke({ title: "Payments slow", service: "payments", severity: "high" });
    assert.ok(opened, "open_incident executes without approval");
  });

  assert.equal(store.listIncidents("open").some((incident) => incident.id === incidentId), true, "still open");
  assert.deepEqual(context.pending, { tool: "resolve_incident", args: { id: incidentId }, reason: "stable" });
  assert.equal(context.held.length, 2);
});
