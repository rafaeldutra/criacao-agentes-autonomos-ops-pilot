import test from "node:test";
import assert from "node:assert/strict";
import { maxIterations } from "./strategy.js";

test("strategy iteration limits are positive integers", () => {
  assert.equal(maxIterations({ maxIterations: 3 }), 3);
  assert.throws(() => maxIterations({ maxIterations: 0 }), /positive integer/);
});
