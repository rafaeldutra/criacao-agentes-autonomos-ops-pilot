import test from "node:test";
import assert from "node:assert/strict";
import { maxIterations } from "./strategy.js";

test("strategy execution uses a bounded iteration option", () => {
  assert.equal(maxIterations({ maxIterations: 8 }), 8);
  assert.throws(() => maxIterations({ maxIterations: -1 }), /positive integer/);
});
