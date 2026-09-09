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
      metrics: { llmCalls: 1, latencyMs: 0 },
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
