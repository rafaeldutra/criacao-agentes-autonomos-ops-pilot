import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { corsHeadersFor, DEFAULT_CORS_ORIGINS, parseCorsOrigins } from "./cors.js";
import { createApp } from "./server.js";
import type { ReasoningStrategy } from "../agents/types.js";
import { createCapturingLogger } from "../obs/test-logger.js";

const ALLOWED = "http://localhost:5173";
const allowlist = [ALLOWED, "https://ops.example.com"];

test("parseCorsOrigins defaults to the local war room origins when unset or blank", () => {
  assert.deepEqual(parseCorsOrigins(undefined), DEFAULT_CORS_ORIGINS);
  assert.deepEqual(parseCorsOrigins("  "), DEFAULT_CORS_ORIGINS);
  assert.ok(DEFAULT_CORS_ORIGINS.includes("http://localhost:5173"));
  assert.ok(DEFAULT_CORS_ORIGINS.includes("http://127.0.0.1:4173"));
});

test("parseCorsOrigins trims, drops empty items and deduplicates", () => {
  assert.deepEqual(
    parseCorsOrigins(" https://ops.example.com , http://localhost:5173,,https://ops.example.com "),
    ["https://ops.example.com", "http://localhost:5173"],
  );
});

for (const invalid of [
  "*",
  "https://ops.example.com,*",
  "https://ops.example.com/path",
  "https://ops.example.com/?q=1",
  "https://user:pw@ops.example.com",
  "ftp://ops.example.com",
  "ops.example.com",
  "https://ops.example.com/",
]) {
  test(`parseCorsOrigins rejects ${JSON.stringify(invalid)}`, () => {
    assert.throws(() => parseCorsOrigins(invalid), /OPSPILOT_CORS_ORIGINS/);
  });
}

test("corsHeadersFor: no Origin yields no headers and no status", () => {
  assert.deepEqual(corsHeadersFor(undefined, "POST", allowlist), { headers: {} });
  assert.deepEqual(corsHeadersFor(undefined, "OPTIONS", allowlist), { headers: {} });
});

test("corsHeadersFor: allowed simple request echoes the origin and exposes X-Request-Id", () => {
  assert.deepEqual(corsHeadersFor(ALLOWED, "POST", allowlist), {
    headers: {
      "Access-Control-Allow-Origin": ALLOWED,
      "Access-Control-Expose-Headers": "X-Request-Id",
      Vary: "Origin",
    },
  });
});

test("corsHeadersFor: allowed preflight answers 204 with methods, headers and max-age", () => {
  assert.deepEqual(corsHeadersFor(ALLOWED, "OPTIONS", allowlist), {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": ALLOWED,
      "Access-Control-Expose-Headers": "X-Request-Id",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
});

test("corsHeadersFor: disallowed origin gets only Vary, and 403 on preflight", () => {
  assert.deepEqual(corsHeadersFor("https://evil.example", "POST", allowlist), { headers: { Vary: "Origin" } });
  assert.deepEqual(corsHeadersFor("https://evil.example", "OPTIONS", allowlist), {
    status: 403,
    headers: { Vary: "Origin" },
  });
});

test("corsHeadersFor never emits a wildcard or credentials", () => {
  for (const origin of [ALLOWED, "https://evil.example", "null", undefined]) {
    for (const method of ["GET", "POST", "OPTIONS"]) {
      const { headers } = corsHeadersFor(origin, method, allowlist);
      assert.notEqual(headers["Access-Control-Allow-Origin"], "*");
      assert.equal(headers["Access-Control-Allow-Credentials"], undefined);
    }
  }
});

// --- HTTP integration (T022) ---

const stub: ReasoningStrategy = {
  name: "react",
  run: async (input) => ({
    answer: `react:${input}`,
    trace: [{ type: "answer", content: "ok" }],
    metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false },
  }),
};

const withApp = async (callback: (base: string) => Promise<void>) => {
  const app = createApp({ react: stub }, {
    corsOrigins: [ALLOWED],
    decideRoute: async () => ({ route: "react", reason: "test router" }),
    logger: createCapturingLogger().logger,
  });
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    await callback(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

test("preflight from an allowed origin answers 204 with CORS headers", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/chat`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), ALLOWED);
    assert.match(response.headers.get("access-control-allow-methods") ?? "", /POST/);
  });
});

test("POST /chat from an allowed origin returns 200 with Allow-Origin and exposed X-Request-Id", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/chat`, {
      method: "POST",
      headers: { Origin: ALLOWED, "content-type": "application/json" },
      body: JSON.stringify({ message: "status" }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), ALLOWED);
    assert.equal(response.headers.get("access-control-expose-headers"), "X-Request-Id");
    assert.ok(response.headers.get("x-request-id"));
  });
});

test("preflight from a disallowed origin answers 403 without Allow-Origin", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/chat`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("requests without Origin are unchanged and carry no CORS headers", async () => {
  await withApp(async (base) => {
    const response = await fetch(`${base}/stats`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("vary"), null);
  });
});
