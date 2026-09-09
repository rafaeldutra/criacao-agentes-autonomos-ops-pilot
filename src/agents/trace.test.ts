import test from "node:test";
import assert from "node:assert/strict";
import { action, answer, formatTrace, observation, plan, thought } from "./trace.js";

test("formats typed trace events deterministically", () => {
  const output = formatTrace([
    thought("inspect alerts"),
    action("list_alerts", { status: "firing" }),
    observation("3 alerts"),
    plan([{ id: 1, description: "open incident", status: "pending" }]),
    answer("done"),
  ]);
  assert.match(output, /\[thought\] inspect alerts/);
  assert.match(output, /\[action\] list_alerts \{"status":"firing"\}/);
  assert.match(output, /\[plan\] open incident/);
});
