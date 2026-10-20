import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultDecideRoute, createProductionGraph, ROUTER_PROMPT, routeDecisionSchema, RouterError, runProductionGraph } from "./production-graph.js";
import { createResilientModel, ModelUnavailableError, type ResilientModel } from "./model.js";
import { createScriptedModel, statusError, type ScriptedModelOptions } from "./test-models.js";
import type { Metrics, ReasoningStrategy } from "./types.js";

const metrics = (overrides: Partial<Metrics> = {}): Metrics => ({
  llmCalls: 1,
  latencyMs: 0,
  historyMessages: 0,
  memoryFacts: 0,
  learningQueued: false,
  ...overrides,
});

const stub = (name: string, calls: string[]): ReasoningStrategy => ({
  name,
  async run(input) {
    calls.push(`${name}:${input}`);
    return {
      answer: `${name} answer`,
      trace: [{ type: "answer", content: `${name} answer` }],
      metrics: metrics({ promptTokens: 7 }),
    };
  },
});

test("runs context, router, selected strategy, and response", async () => {
  const calls: string[] = [];
  const graph = createProductionGraph({
    strategies: {
      react: stub("react", calls),
      "plan-and-execute": stub("plan-and-execute", calls),
    },
    decideRoute: async () => ({ route: "react", reason: "best fit" }),
  });

  const result = await runProductionGraph(graph, {
    message: "status",
    history: [],
    summary: "",
    memories: [],
    budget: { summary: 200, window: 1200, memories: 300 },
  });

  assert.equal(result.answer, "react answer");
  assert.equal(result.route, "react");
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? "", /^react:user: status$/);
  assert.equal(result.metrics.llmCalls, 1);
  assert.equal(result.metrics.promptTokens, 7);
  assert.ok(result.trace.some((event) => event.type === "thought" && event.node === "context"));
  assert.ok(result.trace.some((event) => event.type === "route" && event.node === "router" && event.route === "react"));
  assert.ok(result.trace.every((event) => event.node));
});

test("override skips decideRoute and runs plan-and-execute", async () => {
  const calls: string[] = [];
  let routed = false;
  const graph = createProductionGraph({
    strategies: {
      react: stub("react", calls),
      "plan-and-execute": stub("plan-and-execute", calls),
    },
    decideRoute: async () => {
      routed = true;
      return { route: "react", reason: "should not run" };
    },
  });

  const result = await runProductionGraph(graph, {
    message: "do many things",
    history: [],
    summary: "",
    memories: [],
    budget: { summary: 200, window: 1200, memories: 300 },
    override: "plan-and-execute",
  });

  assert.equal(routed, false);
  assert.equal(result.route, "plan-and-execute");
  assert.match(calls[0] ?? "", /^plan-and-execute:/);
  const routeEvent = result.trace.find((event) => event.type === "route");
  assert.deepEqual(routeEvent, {
    type: "route",
    route: "plan-and-execute",
    reason: "client override",
    node: "router",
  });
});

const budget = { summary: 200, window: 1200, memories: 300 };

const modelStrategy = (name: string, model: ResilientModel): ReasoningStrategy => ({
  name,
  async run(input) {
    const message = await model.invoke(input);
    const content = String(message.content);
    return { answer: content, trace: [{ type: "answer", content }], metrics: metrics() };
  },
});

const resilientModel = (primaryOptions: ScriptedModelOptions = {}) =>
  createResilientModel({
    primary: createScriptedModel({ reply: "primary answer", ...primaryOptions }).model,
    fallback: createScriptedModel({ reply: "fallback answer" }).model,
    primaryModel: "primary/model",
    fallbackModel: "fallback/model",
    retry: { stopAfterAttempt: 1 },
  });

test("reports the primary model in metrics.modelUsed without fallback events", async () => {
  const model = resilientModel();
  const graph = createProductionGraph({
    strategies: { react: modelStrategy("react", model), "plan-and-execute": modelStrategy("plan-and-execute", model) },
    decideRoute: async () => ({ route: "react", reason: "best fit" }),
  });

  const result = await runProductionGraph(graph, { message: "status", history: [], summary: "", memories: [], budget });

  assert.equal(result.answer, "primary answer");
  assert.equal(result.metrics.modelUsed, "primary/model");
  assert.equal(result.trace.some((event) => event.type === "fallback"), false);
});

test("strategy-node fallback adds a stamped fallback event and next turn uses the primary again", async () => {
  let primaryDown = true;
  const healthy = createScriptedModel({ reply: "primary answer" }).model;
  const model = createResilientModel({
    primary: {
      ...healthy,
      invoke: async (value) => {
        if (primaryDown) throw statusError(503, "upstream unavailable");
        return healthy.invoke(value);
      },
    },
    fallback: createScriptedModel({ reply: "fallback answer" }).model,
    primaryModel: "primary/model",
    fallbackModel: "fallback/model",
    retry: { stopAfterAttempt: 1 },
  });
  const graph = createProductionGraph({
    strategies: { react: modelStrategy("react", model), "plan-and-execute": modelStrategy("plan-and-execute", model) },
    decideRoute: async () => ({ route: "react", reason: "best fit" }),
  });

  const degraded = await runProductionGraph(graph, { message: "status", history: [], summary: "", memories: [], budget });

  assert.equal(degraded.answer, "fallback answer");
  assert.equal(degraded.metrics.modelUsed, "fallback/model");
  const reactEvents = degraded.trace.filter((event) => event.node === "react");
  assert.deepEqual(reactEvents[0], {
    type: "fallback",
    fromModel: "primary/model",
    toModel: "fallback/model",
    reason: "503 upstream unavailable",
    node: "react",
  });
  assert.equal(reactEvents[1]?.type, "answer");

  primaryDown = false;
  const recovered = await runProductionGraph(graph, { message: "status", history: [], summary: "", memories: [], budget });

  assert.equal(recovered.answer, "primary answer");
  assert.equal(recovered.metrics.modelUsed, "primary/model");
  assert.equal(recovered.trace.some((event) => event.type === "fallback"), false);
});

test("router-node fallback is stamped with node router", async () => {
  const model = createResilientModel({
    primary: createScriptedModel({ failures: Infinity }).model,
    fallback: createScriptedModel({ structured: { route: "react", reason: "fallback router" } }).model,
    primaryModel: "primary/model",
    fallbackModel: "fallback/model",
    retry: { stopAfterAttempt: 1 },
  });
  const graph = createProductionGraph({
    strategies: { react: stub("react", []), "plan-and-execute": stub("plan-and-execute", []) },
    decideRoute: createDefaultDecideRoute(model),
  });

  const result = await runProductionGraph(graph, { message: "status", history: [], summary: "", memories: [], budget });

  assert.equal(result.route, "react");
  const fallbackEvent = result.trace.find((event) => event.type === "fallback");
  assert.equal(fallbackEvent?.node, "router");
  const types = result.trace.filter((event) => event.node === "router").map((event) => event.type);
  assert.deepEqual(types, ["fallback", "route"]);
});

test("omits metrics.modelUsed when no model call happens", async () => {
  const graph = createProductionGraph({
    strategies: { react: stub("react", []), "plan-and-execute": stub("plan-and-execute", []) },
    decideRoute: async () => ({ route: "react", reason: "best fit" }),
  });

  const result = await runProductionGraph(graph, { message: "status", history: [], summary: "", memories: [], budget });

  assert.equal("modelUsed" in result.metrics, false);
});

test("ModelUnavailableError passes through router and strategy nodes unchanged", async () => {
  const routerGraph = createProductionGraph({
    strategies: { react: stub("react", []), "plan-and-execute": stub("plan-and-execute", []) },
    decideRoute: async () => {
      throw new ModelUnavailableError();
    },
  });
  await assert.rejects(
    () => runProductionGraph(routerGraph, { message: "status", history: [], summary: "", memories: [], budget }),
    (error) => error instanceof ModelUnavailableError && !(error instanceof RouterError),
  );

  const strategyGraph = createProductionGraph({
    strategies: {
      react: {
        name: "react",
        run: async () => {
          throw new ModelUnavailableError();
        },
      },
      "plan-and-execute": stub("plan-and-execute", []),
    },
    decideRoute: async () => ({ route: "react", reason: "best fit" }),
  });
  await assert.rejects(
    () => runProductionGraph(strategyGraph, { message: "status", history: [], summary: "", memories: [], budget }),
    (error) => error instanceof ModelUnavailableError,
  );
});

test("router failures become ROUTER_FAILED and skip strategies", async () => {
  const calls: string[] = [];
  const graph = createProductionGraph({
    strategies: {
      react: stub("react", calls),
      "plan-and-execute": stub("plan-and-execute", calls),
    },
    decideRoute: async () => {
      throw new Error("down");
    },
  });

  await assert.rejects(
    () =>
      runProductionGraph(graph, {
        message: "status",
        history: [],
        summary: "",
        memories: [],
        budget: { summary: 200, window: 1200, memories: 300 },
      }),
    (error) => error instanceof RouterError && error.code === "ROUTER_FAILED",
  );
  assert.deepEqual(calls, []);
});

const teamStub = (calls: string[]): ReasoningStrategy => ({
  name: "team",
  async run(input) {
    calls.push(`team:${input}`);
    return {
      answer: "team answer",
      trace: [
        { type: "handoff", from: "supervisor", to: "analista", brief: "fatos", node: "supervisor" },
        { type: "action", tool: "list_alerts", args: {}, node: "analista" },
        { type: "handoff", from: "supervisor", to: "done", brief: "team answer", node: "supervisor" },
        { type: "answer", content: "team answer" },
      ],
      metrics: metrics({ llmCalls: 3 }),
    };
  },
});

test("override team runs the team strategy and keeps the role nodes", async () => {
  const calls: string[] = [];
  const graph = createProductionGraph({
    strategies: { react: stub("react", calls), "plan-and-execute": stub("plan-and-execute", calls), team: teamStub(calls) },
    decideRoute: async () => {
      throw new Error("router should not run");
    },
  });

  const result = await runProductionGraph(graph, {
    message: "checkout",
    history: [],
    summary: "",
    memories: [],
    budget: { summary: 200, window: 1200, memories: 300 },
    override: "team",
  });

  assert.equal(result.route, "team");
  assert.equal(result.answer, "team answer");
  assert.equal(calls.length, 1);
  assert.ok(result.trace.some((event) => event.type === "route" && event.route === "team" && event.reason === "client override"));
  assert.deepEqual(
    result.trace.filter((event) => event.type === "handoff").map((event) => event.node),
    ["supervisor", "supervisor"],
  );
  assert.ok(result.trace.some((event) => event.type === "action" && event.node === "analista"));
  assert.equal(result.trace.at(-1)?.node, "team");
  assert.equal(result.metrics.llmCalls, 3);
});

test("router may choose team and its prompt lists the team route", async () => {
  const calls: string[] = [];
  const graph = createProductionGraph({
    strategies: { react: stub("react", calls), "plan-and-execute": stub("plan-and-execute", calls), team: teamStub(calls) },
    decideRoute: async () => ({ route: "team", reason: "investigar e agir", source: "llm" }),
  });
  const result = await runProductionGraph(graph, {
    message: "investigue e abra incidente",
    history: [],
    summary: "",
    memories: [],
    budget: { summary: 200, window: 1200, memories: 300 },
  });
  assert.equal(result.route, "team");
  assert.equal(routeDecisionSchema.safeParse({ route: "team", reason: "x" }).success, true);

  const { model, state } = createScriptedModel({ structured: { route: "team", reason: "etapas" } });
  const decision = await createDefaultDecideRoute(model as unknown as ResilientModel)("x");
  assert.equal(decision.route, "team");
  assert.ok(state.schemas.length === 1);
  assert.match(ROUTER_PROMPT, /| team |/);
});

test("team route without a configured team strategy fails as a router error", async () => {
  const calls: string[] = [];
  const graph = createProductionGraph({
    strategies: { react: stub("react", calls), "plan-and-execute": stub("plan-and-execute", calls) },
    decideRoute: async () => ({ route: "react", reason: "unused" }),
  });
  await assert.rejects(
    runProductionGraph(graph, {
      message: "x",
      history: [],
      summary: "",
      memories: [],
      budget: { summary: 200, window: 1200, memories: 300 },
      override: "team",
    }),
    RouterError,
  );
  assert.equal(calls.length, 0);
});
