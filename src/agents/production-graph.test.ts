import test from "node:test";
import assert from "node:assert/strict";
import { createProductionGraph, RouterError, runProductionGraph } from "./production-graph.js";
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
