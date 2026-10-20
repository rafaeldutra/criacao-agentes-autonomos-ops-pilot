import test from "node:test";
import assert from "node:assert/strict";
import { maxIterations } from "./strategy.js";
import { boundTools } from "./react.js";
import { createSeededStore } from "./store.js";
import { createTools } from "./tools.js";

test("strategy execution uses a bounded iteration option", () => {
  assert.equal(maxIterations({ maxIterations: 8 }), 8);
  assert.throws(() => maxIterations({ maxIterations: -1 }), /positive integer/);
});

test("boundTools keeps only the defined tools of a subset", () => {
  const tools = createTools(createSeededStore());
  assert.deepEqual(boundTools({ listAlerts: tools.listAlerts }).map((candidate) => candidate.name), ["list_alerts"]);
  assert.equal(boundTools({ listAlerts: undefined }).length, 0);
  assert.equal(boundTools(tools).length, Object.keys(tools).length);
});
