import test from "node:test";
import assert from "node:assert/strict";
import { createSeededStore } from "../src/agents/store.js";

test("primary seed can be recreated without duplicate records", () => {
  const store = createSeededStore();
  const first = store.read();
  store.reset();
  const second = store.read();
  assert.equal(first.services.length, second.services.length);
  assert.equal(first.alerts.length, second.alerts.length);
  assert.equal(second.incidents.length, 0);
});
