import test from "node:test";
import assert from "node:assert/strict";
import { createLogger, errorMeta, formatLogLine, traceEventMeta } from "./logger.js";

test("traceEventMeta keeps only whitelisted metadata per event type", () => {
  const secret = "SECRET-CONTENT";
  assert.deepEqual(traceEventMeta({ type: "thought", content: secret, node: "context" }, 0), {
    seq: 0,
    node: "context",
    type: "thought",
    chars: secret.length,
  });
  for (const type of ["observation", "critique", "answer", "summarize"] as const) {
    assert.deepEqual(traceEventMeta({ type, content: secret }, 1), { seq: 1, node: undefined, type, chars: secret.length });
  }
  assert.deepEqual(
    traceEventMeta({ type: "action", tool: "list_incidents", args: { status: secret, limit: 3 }, node: "react" }, 2),
    { seq: 2, node: "react", type: "action", tool: "list_incidents", argKeys: 2 },
  );
  assert.deepEqual(
    traceEventMeta(
      { type: "plan", steps: [{ id: 1, description: secret, status: "pending" }, { id: 2, description: secret, status: "pending" }] },
      3,
    ),
    { seq: 3, node: undefined, type: "plan", steps: 2 },
  );
  assert.deepEqual(traceEventMeta({ type: "route", route: "reflect", reason: secret, node: "router" }, 4), {
    seq: 4,
    node: "router",
    type: "route",
    route: "reflect",
  });
  assert.deepEqual(traceEventMeta({ type: "fallback", fromModel: "a/m", toModel: "b/m", reason: secret }, 5), {
    seq: 5,
    node: undefined,
    type: "fallback",
    fromModel: "a/m",
    toModel: "b/m",
  });

  const line = formatLogLine({ ts: "t", level: "info", event: "trace.event", ...traceEventMeta({ type: "thought", content: secret }, 6) });
  assert.doesNotMatch(line, /SECRET-CONTENT|"node"/);
});

test("formatLogLine writes one parseable line without undefined fields", () => {
  const line = formatLogLine({
    ts: "2026-10-13T00:00:00.000Z",
    level: "info",
    event: "request.start",
    requestId: "abc",
    note: "multi\nline",
    missing: undefined,
  });
  assert.doesNotMatch(line, /\n/);
  assert.deepEqual(JSON.parse(line), {
    ts: "2026-10-13T00:00:00.000Z",
    level: "info",
    event: "request.start",
    requestId: "abc",
    note: "multi\nline",
  });
});

test("createLogger routes info to out and warn/error to err with injected clock", () => {
  const out: string[] = [];
  const err: string[] = [];
  const logger = createLogger({
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    now: () => new Date("2026-10-13T12:00:00.000Z"),
  });

  logger.info("a", { n: 1 });
  logger.warn("b");
  logger.error("c", { event: "spoofed", level: "info" });

  assert.equal(out.length, 1);
  assert.equal(err.length, 2);
  assert.ok([...out, ...err].every((line) => line.endsWith("\n") && line.indexOf("\n") === line.length - 1));
  assert.deepEqual(JSON.parse(out[0]!), { ts: "2026-10-13T12:00:00.000Z", level: "info", event: "a", n: 1 });
  assert.equal(JSON.parse(err[0]!).level, "warn");
  assert.deepEqual(JSON.parse(err[1]!), { ts: "2026-10-13T12:00:00.000Z", level: "error", event: "c" });
});

test("errorMeta keeps only name and the first line of the message, capped at 200 chars", () => {
  const error = new TypeError(`${"x".repeat(250)}\nsecond line`);
  const meta = errorMeta(error);
  assert.equal(meta.errorName, "TypeError");
  assert.equal(meta.errorMessage, "x".repeat(200));
  assert.equal(Object.keys(meta).length, 2);
  assert.doesNotMatch(JSON.stringify(meta), /second line|at /);

  assert.deepEqual(errorMeta("plain failure"), { errorName: "string", errorMessage: "plain failure" });
  assert.deepEqual(errorMeta(undefined), { errorName: "undefined", errorMessage: "undefined" });
});
