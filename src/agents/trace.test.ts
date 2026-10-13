import test from "node:test";
import assert from "node:assert/strict";
import { action, answer, fallback, formatTrace, observation, plan, route, thought, withNode } from "./trace.js";

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

test("adds route events and node labels without mutating originals", () => {
  const events = [thought("inspect"), route("react", "client override")];
  const stamped = withNode(events, "react");

  assert.equal(events[0]?.node, undefined);
  assert.equal(stamped[0]?.node, "react");
  assert.equal(stamped[1]?.node, "router");

  const output = formatTrace([thought("ctx"), { ...thought("ctx"), node: "context" }, route("react", "client override")]);
  assert.match(output, /\[thought\] ctx/);
  assert.match(output, /\[thought@context\] ctx/);
  assert.match(output, /\[route@router\] react client override/);
});

test("builds and formats fallback events", () => {
  const event = fallback("primary/model", "backup/model", "503 upstream down");
  assert.deepEqual(event, {
    type: "fallback",
    fromModel: "primary/model",
    toModel: "backup/model",
    reason: "503 upstream down",
  });

  const output = formatTrace([event, ...withNode([event], "react")]);
  assert.match(output, /^\[fallback\] primary\/model -> backup\/model \(503 upstream down\)$/m);
  assert.match(output, /^\[fallback@react\] primary\/model -> backup\/model \(503 upstream down\)$/m);
});
