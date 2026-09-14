import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./server.js";
import type { ReasoningStrategy } from "../agents/types.js";

const result = (answer: string) => ({
  answer,
  trace: [{ type: "answer" as const, content: answer }],
  metrics: { llmCalls: 1, latencyMs: 0 },
});

const strategy = (name: string, run: ReasoningStrategy["run"] = async (input) => result(`${name}:${input}`)): ReasoningStrategy => ({
  name,
  run,
});

const request = async (server: Server, body: unknown): Promise<{ status: number; json: unknown }> => {
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json() };
};

const withServer = async (
  app: ReturnType<typeof createApp>,
  callback: (server: Server) => Promise<void>,
): Promise<void> => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    await callback(server);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

test("returns a successful chat response using the react default", async () => {
  await withServer(createApp({ react: strategy("react") }), async (server) => {
    const response = await request(server, { message: "status" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, result("react:status"));
  });
});

test("returns Zod issues for an invalid body", async () => {
  await withServer(createApp({ react: strategy("react") }), async (server) => {
    const response = await request(server, { message: "" });
    assert.equal(response.status, 400);
    assert.ok(
      typeof response.json === "object" &&
        response.json !== null &&
        "issues" in response.json &&
        Array.isArray(response.json.issues),
    );
  });
});

test("returns 422 for an unknown strategy", async () => {
  await withServer(createApp({ react: strategy("react") }), async (server) => {
    const response = await request(server, { message: "status", strategy: "unknown" });
    assert.equal(response.status, 422);
  });
});

test("applies reflection to the selected strategy", async () => {
  await withServer(
    createApp(
      { react: strategy("react", async () => result("answer")) },
      { reflectionOptions: { critic: async () => ({ approved: true, feedback: "approved" }) } },
    ),
    async (server) => {
      const response = await request(server, { message: "status", reflect: true });
      assert.equal(response.status, 200);
      assert.equal((response.json as { answer: string }).answer, "answer");
      assert.equal((response.json as { trace: Array<{ type: string }> }).trace.at(-1)?.type, "critique");
    },
  );
});

test("returns 504 when strategy execution exceeds the timeout", async () => {
  const slow = strategy("slow", async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return result("late");
  });
  await withServer(createApp({ react: slow }, { timeoutMs: 5 }), async (server) => {
    const response = await request(server, { message: "status" });
    assert.equal(response.status, 504);
  });
});
