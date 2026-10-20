import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TraceEvent } from "../agents/types.js";
import { FakeRequestStore } from "./fake-request-store.js";
import {
  DomainError,
  getRequestOrThrow,
  REQUEST_NOT_FOUND,
  type RequestRecordInput,
  type RequestStore,
} from "./request-store.js";
import { SqliteRequestStore } from "./sqlite-request-store.js";

const ID_OK = "11111111-1111-4111-8111-111111111111";
const ID_ERR = "22222222-2222-4222-8222-222222222222";
const ID_MISSING = "33333333-3333-4333-8333-333333333333";

const fullTrace: TraceEvent[] = [
  { type: "thought", content: "context built", node: "context" },
  { type: "route", route: "react", reason: "needs tools", node: "router" },
  { type: "action", tool: "list_incidents", args: { status: "open", nested: { a: [1, 2] } }, node: "react" },
  { type: "observation", content: "x".repeat(20_000), node: "react" },
  {
    type: "plan",
    steps: [{ id: 1, description: "check", tool: "list_alerts", args: {}, status: "completed" }],
    node: "plan-and-execute",
  },
  { type: "fallback", fromModel: "primary/m", toModel: "backup/m", reason: "429" },
  { type: "critique", content: "fine", node: "reflect" },
  { type: "answer", content: "all good", node: "react" },
  { type: "summarize", content: "summary", node: "response" },
];

const okRecord: RequestRecordInput = {
  requestId: ID_OK,
  createdAt: "2026-10-13T14:02:11.120Z",
  conversationId: "conv-1",
  userId: "user-1",
  route: "react",
  reflect: false,
  status: 200,
  latencyMs: 834,
  metrics: {
    llmCalls: 2,
    promptTokens: 1510,
    modelUsed: "primary/m",
    historyMessages: 4,
    memoryFacts: 1,
    contextBreakdown: { memory: 12, history: 340, message: 7, summary: 0 },
  },
  trace: fullTrace,
};

const errRecord: RequestRecordInput = {
  requestId: ID_ERR,
  createdAt: "2026-10-13T14:03:00.000Z",
  status: 504,
  errorCode: "CHAT_TIMEOUT",
  latencyMs: 5,
  trace: [],
};

const contract = (name: string, make: () => RequestStore) => {
  test(`${name}: round trip preserves record and ordered trace`, () => {
    const store = make();
    store.record(okRecord);
    const detail = store.get(ID_OK);
    assert.ok(detail);
    assert.deepEqual(detail.trace, fullTrace);
    assert.deepEqual(
      detail.trace.map((event) => event.type),
      fullTrace.map((event) => event.type),
    );
    assert.deepEqual({ ...detail, trace: [] }, {
      requestId: ID_OK,
      createdAt: "2026-10-13T14:02:11.120Z",
      conversationId: "conv-1",
      userId: "user-1",
      route: "react",
      reflect: false,
      status: 200,
      errorCode: null,
      latencyMs: 834,
      metrics: {
        llmCalls: 2,
        promptTokens: 1510,
        modelUsed: "primary/m",
        historyMessages: 4,
        memoryFacts: 1,
        contextBreakdown: { memory: 12, history: 340, message: 7, summary: 0 },
      },
      trace: [],
    });
    store.close();
  });

  test(`${name}: absent fields are null and error records have no metrics`, () => {
    const store = make();
    store.record(errRecord);
    assert.deepEqual(store.get(ID_ERR), {
      requestId: ID_ERR,
      createdAt: "2026-10-13T14:03:00.000Z",
      conversationId: null,
      userId: null,
      route: null,
      reflect: null,
      status: 504,
      errorCode: "CHAT_TIMEOUT",
      latencyMs: 5,
      metrics: null,
      trace: [],
    });
    store.close();
  });

  test(`${name}: metrics without contextBreakdown read it back as null`, () => {
    const store = make();
    store.record({
      ...okRecord,
      metrics: { llmCalls: 1, historyMessages: 0, memoryFacts: 0 },
    });
    assert.equal(store.get(ID_OK)?.metrics?.contextBreakdown, null);
    store.close();
  });

  test(`${name}: listSince returns summaries at or after the bound, oldest first`, () => {
    const store = make();
    store.record(errRecord);
    store.record(okRecord);
    store.record({ ...errRecord, requestId: ID_MISSING, createdAt: "2026-10-12T00:00:00.000Z" });
    assert.deepEqual(store.listSince("2026-10-13T14:02:11.120Z"), [
      {
        createdAt: "2026-10-13T14:02:11.120Z",
        route: "react",
        status: 200,
        latencyMs: 834,
        promptTokens: 1510,
        modelUsed: "primary/m",
      },
      {
        createdAt: "2026-10-13T14:03:00.000Z",
        route: null,
        status: 504,
        latencyMs: 5,
        promptTokens: null,
        modelUsed: null,
      },
    ]);
    assert.equal(store.listSince("2026-10-01T00:00:00.000Z").length, 3);
    store.close();
  });

  test(`${name}: unknown id returns undefined and getRequestOrThrow raises REQUEST_NOT_FOUND`, () => {
    const store = make();
    store.record(okRecord);
    assert.equal(store.get(ID_MISSING), undefined);
    assert.equal(getRequestOrThrow(store, ID_OK).requestId, ID_OK);
    assert.throws(
      () => getRequestOrThrow(store, ID_MISSING),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === REQUEST_NOT_FOUND &&
        error.message === `Request not found: ${ID_MISSING}`,
    );
    store.close();
  });

  test(`${name}: record is atomic and rejects duplicates`, () => {
    const store = make();
    const broken = {
      ...okRecord,
      trace: [fullTrace[0]!, { content: "no type" } as unknown as TraceEvent],
    };
    assert.throws(() => store.record(broken));
    assert.equal(store.get(ID_OK), undefined);

    store.record(okRecord);
    assert.throws(() => store.record(okRecord));
    assert.deepEqual(store.get(ID_OK)?.trace, fullTrace);
    store.close();
  });
};

const teamTrace: TraceEvent[] = [
  { type: "route", route: "team", reason: "client override", node: "router" },
  { type: "handoff", from: "supervisor", to: "analista", brief: "levante alertas", node: "supervisor" },
  { type: "action", tool: "list_alerts", args: {}, node: "analista" },
  { type: "handoff", from: "supervisor", to: "done", brief: "resposta", limitReached: true, node: "supervisor" },
  { type: "answer", content: "resposta", node: "team" },
];

const teamContract = (name: string, make: () => RequestStore) => {
  test(`${name}: persists a team turn with its handoff events in order`, () => {
    const store = make();
    store.record({ ...okRecord, route: "team", trace: teamTrace });
    const detail = store.get(ID_OK);
    assert.equal(detail?.route, "team");
    assert.deepEqual(detail?.trace, teamTrace);
  });
};

teamContract("FakeRequestStore", () => new FakeRequestStore());
teamContract("SqliteRequestStore", () => new SqliteRequestStore(":memory:"));

contract("FakeRequestStore", () => new FakeRequestStore());
contract("SqliteRequestStore", () => new SqliteRequestStore(":memory:"));

test("SqliteRequestStore: schema is idempotent on the same file", () => {
  const dir = mkdtempSync(join(tmpdir(), "opspilot-requests-"));
  const path = join(dir, "requests.db");
  try {
    const first = new SqliteRequestStore(path);
    first.record(okRecord);
    first.close();

    const second = new SqliteRequestStore(path);
    assert.deepEqual(second.get(ID_OK)?.trace, fullTrace);
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SqliteRequestStore: adds context_breakdown to a database created before it existed", () => {
  const dir = mkdtempSync(join(tmpdir(), "opspilot-requests-"));
  const path = join(dir, "requests.db");
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE requests (
      request_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, conversation_id TEXT, user_id TEXT,
      route TEXT, reflect INTEGER, status INTEGER NOT NULL, error_code TEXT, latency_ms INTEGER NOT NULL,
      llm_calls INTEGER, prompt_tokens INTEGER, model_used TEXT, history_messages INTEGER, memory_facts INTEGER
    )`);
    legacy.close();

    const store = new SqliteRequestStore(path);
    store.record(okRecord);
    assert.deepEqual(store.get(ID_OK)?.metrics?.contextBreakdown, okRecord.metrics?.contextBreakdown);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("SqliteRequestStore: rebuilds a route CHECK created before the team route, keeping rows", () => {
  const dir = mkdtempSync(join(tmpdir(), "opspilot-requests-"));
  const path = join(dir, "requests.db");
  try {
    const seeded = new DatabaseSync(path);
    seeded.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE requests (
      request_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, conversation_id TEXT, user_id TEXT,
      route TEXT CHECK (route IN ('react', 'plan-and-execute', 'reflect')), reflect INTEGER,
      status INTEGER NOT NULL, error_code TEXT, latency_ms INTEGER NOT NULL, llm_calls INTEGER,
      prompt_tokens INTEGER, model_used TEXT, history_messages INTEGER, memory_facts INTEGER, context_breakdown TEXT
    );
    CREATE TABLE trace_events (
      request_id TEXT NOT NULL REFERENCES requests(request_id), seq INTEGER NOT NULL, node TEXT,
      type TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (request_id, seq)
    );
    INSERT INTO requests (request_id, created_at, route, status, latency_ms) VALUES ('${ID_ERR}', '2026-10-01T00:00:00.000Z', 'react', 200, 3);
    INSERT INTO trace_events (request_id, seq, node, type, payload) VALUES ('${ID_ERR}', 0, 'react', 'answer', '{"content":"old"}');`);
    seeded.close();

    const store = new SqliteRequestStore(path);
    store.record({ ...okRecord, route: "team", trace: teamTrace });
    assert.equal(store.get(ID_OK)?.route, "team");
    assert.deepEqual(store.get(ID_ERR)?.trace, [{ type: "answer", node: "react", content: "old" }]);
    assert.throws(() =>
      store.record({ ...errRecord, requestId: ID_MISSING, route: "bogus" as unknown as "team" }),
    );
    store.close();

    const reopened = new SqliteRequestStore(path);
    assert.equal(reopened.get(ID_OK)?.route, "team");
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
