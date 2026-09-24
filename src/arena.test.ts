import test from "node:test";
import assert from "node:assert/strict";
import { parseArenaArgs, runArena } from "./arena.js";
import type { ReasoningStrategy } from "./agents/types.js";

const strategy = (name: string): ReasoningStrategy => ({
  name,
  async run() {
    return {
      answer: `${name} answer`,
      trace: [{ type: "answer", content: `${name} answer` }],
      metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false },
    };
  },
});

test("parses strategy and iteration flags", () => {
  assert.deepEqual(parseArenaArgs(["--strategies", "react", "--max-iterations", "3"]), {
    strategies: ["react"],
    maxIterations: 3,
    input: "List firing alerts and summarize the operational risk.",
  });
  assert.deepEqual(parseArenaArgs(["quantos alertas critico estão disparando", "--strategies", "react"]), {
    strategies: ["react"],
    maxIterations: 8,
    input: "quantos alertas critico estão disparando",
  });
  assert.deepEqual(parseArenaArgs(["react", "quantos alertas criticos estão disparando"]), {
    strategies: ["react"],
    maxIterations: 8,
    input: "quantos alertas criticos estão disparando",
  });
  assert.deepEqual(parseArenaArgs(["react", "reflect:react", "resuma o plantão"]), {
    strategies: ["react", "reflect:react"],
    maxIterations: 8,
    input: "resuma o plantão",
  });
  assert.deepEqual(parseArenaArgs(["react,reflect:react", "resuma o plantão"]).strategies, ["react", "reflect:react"]);
  assert.throws(() => parseArenaArgs(["--max-iterations", "0"]), /positive integer/);
});

test("prints separate output for selected strategies", async () => {
  const output = await runArena(
    { strategies: ["react", "plan-and-execute"], maxIterations: 2, input: "status" },
    { react: strategy("react"), "plan-and-execute": strategy("plan-and-execute") },
  );
  assert.match(output, /## react/);
  assert.match(output, /## plan-and-execute/);
  assert.match(output, /Metrics/);
});

test("accepts reflection strategy aliases", () => {
  assert.deepEqual(parseArenaArgs(["reflect:react", "status"]).strategies, ["reflect:react"]);
  assert.deepEqual(parseArenaArgs(["reflect:plan-and-execute", "status"]).strategies, ["reflect:plan-and-execute"]);
  assert.throws(() => parseArenaArgs(["--strategies", "reflect:unknown", "status"]), /Unknown strategy/);
  assert.throws(() => parseArenaArgs(["reflect:unknown", "status"]), /Unknown strategy/);
});

test("runs injected strategies selected by reflection aliases", async () => {
  const output = await runArena(
    { strategies: ["reflect:react", "reflect:plan-and-execute"], maxIterations: 1, input: "status" },
    {
      "reflect:react": strategy("reflect:react"),
      "reflect:plan-and-execute": strategy("reflect:plan-and-execute"),
    },
  );
  assert.match(output, /## reflect:react/);
  assert.match(output, /## reflect:plan-and-execute/);
});
