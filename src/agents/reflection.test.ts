import test from "node:test";
import assert from "node:assert/strict";
import { withReflection } from "./reflection.js";
import type { ReasoningResult, ReasoningStrategy } from "./types.js";

const result = (answer: string, observation: string): ReasoningResult => ({
  answer,
  trace: [{ type: "observation", content: observation }, { type: "answer", content: answer }],
  metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false },
});

const strategyWith = (answers: string[]): { strategy: ReasoningStrategy; inputs: string[] } => {
  const inputs: string[] = [];
  let index = 0;
  return {
    inputs,
    strategy: {
      name: "react",
      async run(input) {
        inputs.push(input);
        const answer = answers[Math.min(index++, answers.length - 1)] ?? "fallback";
        return result(answer, `observation-${index}`);
      },
    },
  };
};

test("approves the first answer and records a critique", async () => {
  const base = strategyWith(["supported"]);
  const reflected = withReflection(base.strategy, {
    critic: async ({ input, answer, observations }) => {
      assert.equal(input, "pedido");
      assert.equal(answer, "supported");
      assert.equal(observations, "observation-1");
      return { approved: true, feedback: "supported by observations" };
    },
  });

  const output = await reflected.run("pedido");
  assert.equal(output.answer, "supported");
  assert.equal(output.trace.filter((event) => event.type === "critique").length, 1);
  const last = output.trace.at(-1);
  assert.equal(last?.type, "critique");
  if (!last || last.type !== "critique") throw new Error("Expected a critique event");
  assert.match(last.content, /approved/);
  assert.equal(output.metrics.llmCalls, 2);
});

test("regenerates with actionable feedback and stops after approval", async () => {
  const base = strategyWith(["wrong", "correct"]);
  let critiques = 0;
  const reflected = withReflection(base.strategy, {
    critic: async ({ answer, observations, feedback }) => {
      critiques += 1;
      assert.match(observations, /observation/);
      if (critiques === 1) {
        assert.equal(answer, "wrong");
        assert.equal(feedback, undefined);
        return { approved: false, feedback: "Use the observed value." };
      }
      assert.equal(answer, "correct");
      return { approved: true, feedback: "Now supported." };
    },
  });

  const output = await reflected.run("pedido");
  assert.equal(output.answer, "correct");
  assert.equal(critiques, 2);
  assert.match(base.inputs[1] ?? "", /Use the observed value/);
  assert.equal(output.metrics.llmCalls, 4);
  assert.equal(output.trace.filter((event) => event.type === "critique").length, 2);
});

test("returns the last answer at the reflection limit", async () => {
  const base = strategyWith(["first", "second", "third"]);
  const reflected = withReflection(base.strategy, {
    maxReflections: 2,
    critic: async () => ({ approved: false, feedback: "Fix it." }),
  });

  const output = await reflected.run("pedido");
  assert.equal(output.answer, "second");
  assert.equal(output.trace.filter((event) => event.type === "critique").length, 2);
  assert.equal(output.metrics.llmCalls, 4);
});

test("rejects invalid reflection limits", () => {
  const base = strategyWith(["answer"]);
  assert.rejects(() => withReflection(base.strategy, { maxReflections: 0 }).run("pedido"), /positive integer/);
});

test("rejects empty critic feedback", async () => {
  const base = strategyWith(["answer"]);
  const reflected = withReflection(base.strategy, {
    critic: async () => ({ approved: false, feedback: "" }),
  });
  await assert.rejects(() => reflected.run("pedido"), /too_small/);
});
