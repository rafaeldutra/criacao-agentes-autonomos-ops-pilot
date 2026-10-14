import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type ChatServerOptions } from "./server.js";
import { APPROVAL_REQUIRED_OBSERVATION } from "../approvals/approval-gate.js";
import { createToolExecutor } from "../agents/react.js";
import { createSeededStore } from "../agents/store.js";
import { createTools } from "../agents/tools.js";
import { ModelUnavailableError } from "../agents/model.js";
import type { ReasoningStrategy, TraceEvent } from "../agents/types.js";
import { createCapturingLogger } from "../obs/test-logger.js";
import { FakeApprovalStore } from "../store/fake-approval-store.js";
import { FakeConversationStore } from "../store/fake-conversation-store.js";
import { FakeRequestStore } from "../store/fake-request-store.js";

type Json = Record<string, any>;

const T0 = new Date("2026-10-14T12:00:00.000Z");

/**
 * Stub agent that always tries to resolve `incidentId` through the real (gated) tool, so the
 * HTTP layer is exercised end to end without a model. `failTurn` makes the next run throw.
 */
const setup = (options: { failResume?: boolean; openIncident?: boolean } = {}) => {
  const store = createSeededStore();
  const incidentId = store.openIncident("Checkout slow", "checkout", "high").id;
  let resolveCalls = 0;
  const realResolve = store.resolveIncident.bind(store);
  store.resolveIncident = (id, summary) => {
    resolveCalls += 1;
    return realResolve(id, summary);
  };
  const tools = createTools(store);
  let runs = 0;

  const react: ReasoningStrategy = {
    name: "react",
    run: async (input) => {
      runs += 1;
      if (options.failResume && runs > 1) throw new ModelUnavailableError();
      const trace: TraceEvent[] = [{ type: "thought", content: "checkout recovered" }];
      if (options.openIncident) {
        const opened = await tools.openIncident.invoke({ title: "Payments", service: "payments", severity: "high" });
        trace.push({ type: "action", tool: "open_incident", args: {} }, { type: "observation", content: JSON.stringify(opened) });
        return done(trace, "opened");
      }
      const args = { id: incidentId, summary: "rollback", reason: "metrics stable for 30 min" };
      trace.push({ type: "action", tool: "resolve_incident", args });
      const observation = await tools.resolveIncident.invoke(args);
      const content = typeof observation === "string" ? observation : JSON.stringify(observation);
      trace.push({ type: "observation", content });
      const answer = content.startsWith("APPROVAL_REQUIRED")
        ? "Preciso da sua aprovação."
        : content.startsWith("DENIED")
          ? `Não resolvi: negado. (${input.length})`
          : "Incidente resolvido.";
      return done(trace, answer);
    },
  };

  const approvals = new FakeApprovalStore();
  const requests = new FakeRequestStore();
  const conversations = new FakeConversationStore();
  let clock = T0;
  const appOptions: ChatServerOptions = {
    approvals,
    requests,
    conversations,
    executeTool: createToolExecutor(tools),
    approvalTtlMinutes: 60,
    now: () => clock,
    decideRoute: async () => ({ route: "react", reason: "test router" }),
    logger: createCapturingLogger().logger,
  };
  return {
    app: createApp({ react }, appOptions),
    store,
    incidentId,
    approvals,
    requests,
    conversations,
    resolveCalls: () => resolveCalls,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
};

const done = (trace: TraceEvent[], answer: string) => ({
  answer,
  trace: [...trace, { type: "answer" as const, content: answer }],
  metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false },
});

const withServer = async (app: ReturnType<typeof createApp>, callback: (base: string) => Promise<void>) => {
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    await callback(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

const call = async (base: string, path: string, body?: unknown) => {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, json: (await response.json()) as Json, requestId: response.headers.get("x-request-id") };
};

const isOpen = (ctx: ReturnType<typeof setup>) =>
  ctx.store.listIncidents("open").some((incident) => incident.id === ctx.incidentId);

test("POST /chat answers 202 with the pending approval and does not execute the tool", async () => {
  const ctx = setup();
  await withServer(ctx.app, async (base) => {
    const response = await call(base, "/chat", { message: "resolva o incidente do checkout" });
    assert.equal(response.status, 202);
    assert.equal(response.json.status, "pending_approval");
    assert.equal(response.json.requestId, response.requestId);
    assert.ok(response.json.conversationId);
    assert.equal(response.json.answer, "Preciso da sua aprovação.");
    const approval = response.json.approval as Json;
    assert.equal(approval.status, "pending");
    assert.equal(approval.tool, "resolve_incident");
    assert.deepEqual(approval.args, { id: ctx.incidentId, summary: "rollback" });
    assert.equal(approval.reason, "metrics stable for 30 min");
    assert.equal(approval.requestId, response.requestId);
    assert.equal(approval.conversationId, response.json.conversationId);
    assert.equal("userId" in approval, false);
    const trace = response.json.trace as Json[];
    assert.ok(trace.some((event) => event.type === "action" && event.tool === "resolve_incident"));
    assert.ok(trace.some((event) => event.type === "observation" && event.content === APPROVAL_REQUIRED_OBSERVATION("resolve_incident")));
    assert.equal(ctx.resolveCalls(), 0);
    assert.equal(isOpen(ctx), true);

    const persisted = ctx.requests.get(response.requestId!);
    assert.equal(persisted?.status, 202);
    assert.equal(persisted?.trace.length, trace.length, "partial trace persisted for 202");
  });
});

test("POST /chat on a conversation with a pending approval answers 409 and runs nothing", async () => {
  const ctx = setup();
  await withServer(ctx.app, async (base) => {
    const first = await call(base, "/chat", { message: "resolva" });
    const conversationId = first.json.conversationId as string;
    const before = ctx.conversations.lastMessages(conversationId, 50).length;
    const second = await call(base, "/chat", { message: "e agora?", conversationId });
    assert.equal(second.status, 409);
    assert.equal(second.json.code, "APPROVAL_PENDING");
    assert.equal(second.json.approvalId, (first.json.approval as Json).id);
    assert.equal(second.json.requestId, second.requestId);
    assert.equal(ctx.conversations.lastMessages(conversationId, 50).length, before);
  });
});

test("open_incident executes immediately without approval", async () => {
  const ctx = setup({ openIncident: true });
  await withServer(ctx.app, async (base) => {
    const response = await call(base, "/chat", { message: "abra um incidente" });
    assert.equal(response.status, 200);
    assert.equal(response.json.approval, undefined);
    assert.ok(ctx.store.listIncidents("open").some((incident) => incident.title === "Payments"));
  });
});

test("approve executes the tool exactly once, resumes the agent and returns 200 with the final approval", async () => {
  const ctx = setup();
  await withServer(ctx.app, async (base) => {
    const pending = await call(base, "/chat", { message: "resolva" });
    const id = (pending.json.approval as Json).id as string;
    const decided = await call(base, `/approvals/${id}/decision`, { decision: "approve" });
    assert.equal(decided.status, 200);
    assert.equal(decided.json.requestId, decided.requestId);
    assert.equal(decided.json.answer, "Incidente resolvido.", "the resumed turn replays the stored result");
    assert.equal(decided.json.conversationId, pending.json.conversationId);
    const approval = decided.json.approval as Json;
    assert.equal(approval.status, "approved");
    assert.equal(approval.decidedAt, T0.toISOString());
    assert.equal(approval.resumeRequestId, decided.requestId);
    assert.match(approval.result as string, /"status":"resolved"/);
    assert.equal(ctx.resolveCalls(), 1, "executed once even though the resumed agent called the tool again");
    assert.equal(isOpen(ctx), false);

    const history = ctx.conversations.lastMessages(pending.json.conversationId as string, 50);
    assert.ok(history.some((message) => message.role === "user" && message.content.startsWith("[decisão]")));

    const again = await call(base, `/approvals/${id}/decision`, { decision: "approve" });
    assert.equal(again.status, 409);
    assert.equal(again.json.code, "APPROVAL_ALREADY_DECIDED");
    assert.equal((again.json.approval as Json).status, "approved");
    assert.equal(ctx.resolveCalls(), 1);

    const persisted = ctx.requests.get(decided.requestId!);
    assert.equal(persisted?.status, 200, "decision requests are audited like /chat");
  });
});

test("deny never executes the tool and resumes with the denial", async () => {
  const ctx = setup();
  await withServer(ctx.app, async (base) => {
    const pending = await call(base, "/chat", { message: "resolva" });
    const id = (pending.json.approval as Json).id as string;
    const decided = await call(base, `/approvals/${id}/decision`, { decision: "deny" });
    assert.equal(decided.status, 200);
    assert.equal((decided.json.approval as Json).status, "denied");
    assert.match(decided.json.answer as string, /^Não resolvi: negado/);
    assert.equal(ctx.resolveCalls(), 0);
    assert.equal(isOpen(ctx), true);
  });
});

test("decision validation, not found and expired", async () => {
  const ctx = setup();
  await withServer(ctx.app, async (base) => {
    const notUuid = await call(base, "/approvals/abc/decision", { decision: "approve" });
    assert.equal(notUuid.status, 400);
    assert.ok(Array.isArray(notUuid.json.issues));

    const missing = "11111111-1111-4111-8111-111111111111";
    assert.equal((await call(base, `/approvals/${missing}/decision`, { decision: "maybe" })).status, 400);
    assert.equal((await call(base, `/approvals/${missing}/decision`, { decision: "approve", extra: 1 })).status, 400);
    const notFound = await call(base, `/approvals/${missing}/decision`, { decision: "approve" });
    assert.equal(notFound.status, 404);
    assert.equal(notFound.json.code, "APPROVAL_NOT_FOUND");
    assert.ok(notFound.requestId);

    const pending = await call(base, "/chat", { message: "resolva" });
    const id = (pending.json.approval as Json).id as string;
    ctx.advance(61 * 60_000);
    const expired = await call(base, `/approvals/${id}/decision`, { decision: "approve" });
    assert.equal(expired.status, 409);
    assert.equal(expired.json.code, "APPROVAL_EXPIRED");
    assert.equal((expired.json.approval as Json).status, "expired");
    assert.equal(ctx.resolveCalls(), 0);

    const chatAfterExpiry = await call(base, "/chat", { message: "oi", conversationId: pending.json.conversationId });
    assert.notEqual(chatAfterExpiry.status, 409, "an expired approval no longer blocks the conversation");
  });
});

test("a failing resumed turn answers 503 but the decision is already recorded", async () => {
  const ctx = setup({ failResume: true });
  await withServer(ctx.app, async (base) => {
    const pending = await call(base, "/chat", { message: "resolva" });
    const id = (pending.json.approval as Json).id as string;
    const decided = await call(base, `/approvals/${id}/decision`, { decision: "approve" });
    assert.equal(decided.status, 503);
    assert.equal(decided.json.code, "MODEL_SERVICE_UNAVAILABLE");
    const current = await call(base, `/approvals/${id}`);
    assert.equal(current.status, 200);
    assert.equal(current.json.status, "approved");
    assert.equal(ctx.resolveCalls(), 1);
  });
});

test("GET /approvals/:id returns the view, 404 and 400", async () => {
  const ctx = setup();
  await withServer(ctx.app, async (base) => {
    const pending = await call(base, "/chat", { message: "resolva" });
    const id = (pending.json.approval as Json).id as string;
    const found = await call(base, `/approvals/${id}`);
    assert.equal(found.status, 200);
    assert.deepEqual(found.json, pending.json.approval);
    assert.equal((await call(base, "/approvals/11111111-1111-4111-8111-111111111111")).status, 404);
    assert.equal((await call(base, "/approvals/nope")).status, 400);
  });
});
