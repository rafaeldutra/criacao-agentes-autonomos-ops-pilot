import test from "node:test";
import assert from "node:assert/strict";
import { createApprovalContext, runWithApprovalContext } from "../approvals/approval-gate.js";
import { createResilientModel } from "../agents/model.js";
import { RouterError } from "../agents/production-graph.js";
import { boundTools } from "../agents/react.js";
import { createSeededStore, type InMemoryStore } from "../agents/store.js";
import { createScriptedModel } from "../agents/test-models.js";
import { createTools, type AgentTools } from "../agents/tools.js";
import { action, answer, observation } from "../agents/trace.js";
import type { ReasoningResult, TeamRole, TraceEvent } from "../agents/types.js";
import type { DecideNext, FinishReason, SupervisorDecision } from "./supervisor.js";
import { createDefaultSpecialistRunner, createTeamStrategy, type SpecialistRunner } from "./team-graph.js";

const model = () => {
  const primary = createScriptedModel({ reply: "especialista respondeu" });
  return {
    model: createResilientModel({
      primary: primary.model,
      fallback: createScriptedModel().model,
      primaryModel: "primary/model",
      fallbackModel: "fallback/model",
      retry: { stopAfterAttempt: 1 },
    }),
    state: primary.state,
  };
};

type DeciderCall = { blackboard: string; forceFinish: boolean; reason?: FinishReason };

/** Plays the decisions in order; the last one repeats. */
const scriptedDecider = (decisions: SupervisorDecision[]): { decide: DecideNext; calls: DeciderCall[] } => {
  const calls: DeciderCall[] = [];
  return {
    calls,
    decide: async (input) => {
      calls.push(input);
      return decisions[Math.min(calls.length - 1, decisions.length - 1)] as SupervisorDecision;
    },
  };
};

const result = (content: string, trace: TraceEvent[] = []): ReasoningResult => ({
  answer: content,
  trace: [...trace, answer(content)],
  metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false },
});

/** Calls a tool the way a model would; the tool must be bound to the role. */
const use = async (tools: Partial<AgentTools>, key: keyof AgentTools, args: Record<string, unknown>) => {
  const candidate = tools[key];
  if (!candidate) throw new Error(`tool ${String(key)} is not bound to this role`);
  const invoke = candidate.invoke.bind(candidate) as (input: Record<string, unknown>) => Promise<unknown>;
  const output = await invoke(args);
  const content = typeof output === "string" ? output : JSON.stringify(output);
  return [action(candidate.name, args), observation(content)];
};

type RunnerCall = { role: TeamRole; prompt: string; toolNames: string[] };

const recordingRunner = (
  behavior: Partial<Record<TeamRole, (tools: Partial<AgentTools>) => Promise<ReasoningResult>>>,
): { run: SpecialistRunner; calls: RunnerCall[] } => {
  const calls: RunnerCall[] = [];
  return {
    calls,
    run: async (role, input) => {
      calls.push({ role, prompt: input.prompt, toolNames: boundTools(input.tools).map((candidate) => candidate.name) });
      return (behavior[role] ?? (async () => result(`${role} ok`)))(input.tools);
    },
  };
};

const handoffs = (trace: TraceEvent[]) =>
  trace.flatMap((event) => (event.type === "handoff" ? [event] : []));

const openCheckoutIncident = (store: InMemoryStore) => store.openIncident("checkout lento", "checkout", "high");

test("supervisor hands work analista -> planejador -> executor -> done and answers from the board", async () => {
  const store = createSeededStore();
  const tools = createTools(store);
  const decider = scriptedDecider([
    { next: "analista", brief: "levante alertas do checkout" },
    { next: "planejador", brief: "planeje a resposta" },
    { next: "executor", brief: "abra incidente high no checkout" },
    { next: "done", brief: "Incidente aberto para o checkout." },
  ]);
  const runner = recordingRunner({
    analista: async (bound) => result("2 alertas firing no checkout", await use(bound, "listAlerts", {})),
    planejador: async () => result("1. abrir incidente high no checkout"),
    executor: async (bound) =>
      result("incidente aberto", await use(bound, "openIncident", { title: "checkout lento", service: "checkout", severity: "high" })),
  });

  const output = await createTeamStrategy(model().model, tools, { decideNext: decider.decide, runSpecialist: runner.run }).run("checkout?");

  assert.equal(output.answer, "Incidente aberto para o checkout.");
  assert.deepEqual(handoffs(output.trace).map((event) => event.to), ["analista", "planejador", "executor", "done"]);
  assert.ok(handoffs(output.trace).every((event) => event.node === "supervisor" && event.from === "supervisor"));
  assert.equal(handoffs(output.trace).some((event) => event.limitReached), false);
  assert.deepEqual(runner.calls.map((call) => call.role), ["analista", "planejador", "executor"]);
  assert.deepEqual(runner.calls[1]?.toolNames, []);
  assert.ok(output.trace.some((event) => event.type === "action" && event.node === "analista" && event.tool === "list_alerts"));
  assert.ok(output.trace.some((event) => event.type === "action" && event.node === "executor" && event.tool === "open_incident"));
  assert.equal(output.trace.some((event) => event.type === "action" && event.node === "planejador"), false);
  assert.equal(store.listIncidents("open").length, 1);
  assert.equal(output.trace.at(-1)?.type, "answer");
  assert.equal(output.metrics.llmCalls, 4 + 3);

  // Each decision sees the contributions made so far.
  assert.match(decider.calls[1]?.blackboard ?? "", /#1 Analista[\s\S]*2 alertas firing no checkout/);
  assert.match(decider.calls[3]?.blackboard ?? "", /#3 Executor/);
  assert.match(runner.calls[1]?.prompt ?? "", /Instrução do supervisor:\nplaneje a resposta/);
});

test("supervisor may finish before any specialist acts", async () => {
  const decider = scriptedDecider([{ next: "done", brief: "Nada a investigar." }]);
  const runner = recordingRunner({});
  const output = await createTeamStrategy(model().model, createTools(createSeededStore()), {
    decideNext: decider.decide,
    runSpecialist: runner.run,
  }).run("oi");

  assert.equal(output.answer, "Nada a investigar.");
  assert.equal(runner.calls.length, 0);
  assert.equal(handoffs(output.trace).length, 1);
});

test("an invalid supervisor decision fails with RouterError before any specialist runs", async () => {
  const runner = recordingRunner({});
  const decideNext: DecideNext = async () => ({ next: "dba", brief: "x" }) as unknown as SupervisorDecision;
  await assert.rejects(
    createTeamStrategy(model().model, createTools(createSeededStore()), { decideNext, runSpecialist: runner.run }).run("x"),
    RouterError,
  );
  const empty: DecideNext = async () => ({ next: "analista", brief: "  " });
  await assert.rejects(
    createTeamStrategy(model().model, createTools(createSeededStore()), { decideNext: empty, runSpecialist: runner.run }).run("x"),
    RouterError,
  );
  assert.equal(runner.calls.length, 0);
});

test("the analista cannot reach a state-changing tool", async () => {
  const store = createSeededStore();
  const decider = scriptedDecider([
    { next: "analista", brief: "abra um incidente" },
    { next: "done", brief: "fim" },
  ]);
  const runner = recordingRunner({
    analista: async (bound) => result("tentou", await use(bound, "openIncident", { title: "x", service: "checkout", severity: "low" })),
  });

  const output = await createTeamStrategy(model().model, createTools(store), {
    decideNext: decider.decide,
    runSpecialist: runner.run,
  }).run("x");

  assert.equal(store.listIncidents("all").length, 0);
  assert.match(decider.calls[1]?.blackboard ?? "", /#1 Analista \(falhou\)[\s\S]*not bound/);
  assert.ok(output.trace.some((event) => event.type === "observation" && event.node === "analista" && /falhou/.test(event.content)));
});

test("default runner binds only the role's tools and never binds tools to the planejador", async () => {
  const tools = createTools(createSeededStore());
  const analista = model();
  await createDefaultSpecialistRunner(analista.model)("analista", { prompt: "x", tools: { listAlerts: tools.listAlerts } });
  assert.deepEqual(
    analista.state.tools.map((candidate) => (candidate as { name: string }).name),
    ["list_alerts"],
  );

  const planejador = model();
  const planned = await createDefaultSpecialistRunner(planejador.model)("planejador", { prompt: "x", tools: {} });
  assert.equal(planejador.state.tools.length, 0);
  assert.equal(planned.answer, "especialista respondeu");
  assert.equal(planned.trace.some((event) => event.type === "action"), false);
});

test("resolve_incident by the executor waits for approval and forces done", async () => {
  const store = createSeededStore();
  const incident = openCheckoutIncident(store);
  const decider = scriptedDecider([
    { next: "executor", brief: "resolva o incidente" },
    { next: "done", brief: "Resolução aguarda aprovação humana." },
  ]);
  const runner = recordingRunner({
    executor: async (bound) =>
      result("pedido enviado", await use(bound, "resolveIncident", { id: incident.id, reason: "mitigado" })),
  });
  const context = createApprovalContext();

  const output = await runWithApprovalContext(context, () =>
    createTeamStrategy(model().model, createTools(store), { decideNext: decider.decide, runSpecialist: runner.run }).run("resolva"),
  );

  assert.equal(context.pending?.tool, "resolve_incident");
  assert.equal(store.listIncidents("open").length, 1);
  assert.deepEqual(decider.calls[1], {
    blackboard: decider.calls[1]?.blackboard,
    forceFinish: true,
    reason: "approval",
  });
  assert.match(decider.calls[1]?.blackboard ?? "", /APPROVAL_REQUIRED/);
  assert.equal(handoffs(output.trace).at(-1)?.to, "done");
  assert.equal(handoffs(output.trace).at(-1)?.limitReached, undefined);
  assert.ok(output.trace.some((event) => event.type === "observation" && event.node === "executor" && /^APPROVAL_REQUIRED/.test(event.content)));
});

test("a denied resolution is recorded on the board and the incident stays open", async () => {
  const store = createSeededStore();
  const incident = openCheckoutIncident(store);
  const decider = scriptedDecider([
    { next: "executor", brief: "resolva o incidente" },
    { next: "done", brief: "A resolução foi negada." },
  ]);
  const runner = recordingRunner({
    executor: async (bound) =>
      result("tentei", await use(bound, "resolveIncident", { id: incident.id, reason: "mitigado" })),
  });
  const context = createApprovalContext([
    { tool: "resolve_incident", args: { id: incident.id }, outcome: "denied" },
  ]);

  await runWithApprovalContext(context, () =>
    createTeamStrategy(model().model, createTools(store), { decideNext: decider.decide, runSpecialist: runner.run }).run("resolva"),
  );

  assert.match(decider.calls[1]?.blackboard ?? "", /DENIED/);
  assert.equal(decider.calls[1]?.forceFinish, false);
  assert.equal(store.listIncidents("open").length, 1);
});

test("the team stops at 8 supervisor decisions with a forced, flagged done", async () => {
  const calls: DeciderCall[] = [];
  const decideNext: DecideNext = async (input) => {
    calls.push(input);
    return input.forceFinish ? { next: "done", brief: "Melhor resposta com o que há no quadro." } : { next: "analista", brief: "mais fatos" };
  };
  const runner = recordingRunner({});

  const output = await createTeamStrategy(model().model, createTools(createSeededStore()), {
    decideNext,
    runSpecialist: runner.run,
  }).run("loop");

  const passes = handoffs(output.trace);
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.map((call) => call.forceFinish), [false, false, false, false, false, false, false, true]);
  assert.equal(calls[7]?.reason, "limit");
  assert.equal(passes.length, 8);
  assert.equal(runner.calls.length, 7);
  assert.deepEqual(passes.at(-1), {
    type: "handoff",
    from: "supervisor",
    to: "done",
    brief: "Melhor resposta com o que há no quadro.",
    limitReached: true,
    node: "supervisor",
  });
  assert.equal(passes.slice(0, -1).some((event) => event.limitReached), false);
  assert.equal(output.answer, "Melhor resposta com o que há no quadro.");
});

test("a forced decision that is not done is rejected", async () => {
  const decideNext: DecideNext = async () => ({ next: "analista", brief: "mais fatos" });
  await assert.rejects(
    createTeamStrategy(model().model, createTools(createSeededStore()), {
      decideNext,
      runSpecialist: recordingRunner({}).run,
    }).run("loop"),
    RouterError,
  );
});

test("approval pending on the 7th pass forces the 8th decision with reason approval", async () => {
  const store = createSeededStore();
  const incident = openCheckoutIncident(store);
  const calls: DeciderCall[] = [];
  const decideNext: DecideNext = async (input) => {
    calls.push(input);
    if (input.forceFinish) return { next: "done", brief: "Aguardando aprovação." };
    return calls.length === 7 ? { next: "executor", brief: "resolva" } : { next: "analista", brief: "fatos" };
  };
  const runner = recordingRunner({
    executor: async (bound) => result("pedido", await use(bound, "resolveIncident", { id: incident.id, reason: "ok" })),
  });
  const context = createApprovalContext();

  const output = await runWithApprovalContext(context, () =>
    createTeamStrategy(model().model, createTools(store), { decideNext, runSpecialist: runner.run }).run("x"),
  );

  assert.equal(calls.length, 8);
  assert.equal(calls[7]?.reason, "approval");
  assert.equal(handoffs(output.trace).at(-1)?.limitReached, undefined);
  assert.equal(context.pending?.tool, "resolve_incident");
  assert.equal(store.listIncidents("open").length, 1);
});
