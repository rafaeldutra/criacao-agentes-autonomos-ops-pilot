import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./server.js";
import { HISTORY_WINDOW } from "./chat-history.js";
import type { ReasoningStrategy } from "../agents/types.js";
import { FakeConversationStore } from "../store/fake-conversation-store.js";

const result = (answer: string) => ({
  answer,
  trace: [{ type: "answer" as const, content: answer }],
  metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0 },
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
  const conversations = new FakeConversationStore();
  await withServer(createApp({ react: strategy("react") }, { conversations }), async (server) => {
    const response = await request(server, { message: "status" });
    assert.equal(response.status, 200);
    const body = response.json as { answer: string; conversationId: string; metrics: { historyMessages: number } };
    assert.match(body.answer, /^react:/);
    assert.ok(body.conversationId);
    assert.equal(body.metrics.historyMessages, 0);
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
      assert.ok((response.json as { conversationId: string }).conversationId);
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

test("echoes conversationId across turns", async () => {
  const conversations = new FakeConversationStore();
  await withServer(createApp({ react: strategy("react") }, { conversations }), async (server) => {
    const first = await request(server, { message: "hello" });
    assert.equal(first.status, 200);
    const id = (first.json as { conversationId: string }).conversationId;
    const second = await request(server, { message: "again", conversationId: id });
    assert.equal(second.status, 200);
    assert.equal((second.json as { conversationId: string }).conversationId, id);
    assert.equal((second.json as { metrics: { historyMessages: number } }).metrics.historyMessages, 2);
  });
});

test("returns 404 for unknown conversationId before strategy runs", async () => {
  let ran = false;
  const conversations = new FakeConversationStore();
  const stub = strategy("react", async () => {
    ran = true;
    return result("should-not-run");
  });
  await withServer(createApp({ react: stub }, { conversations }), async (server) => {
    const response = await request(server, { message: "hello", conversationId: "conv-missing" });
    assert.equal(response.status, 404);
    assert.equal(ran, false);
    assert.equal((response.json as { code: string }).code, "CONVERSATION_NOT_FOUND");
  });
});

test("reports historyMessages 0, 3, and caps injected history at 12", async () => {
  const conversations = new FakeConversationStore();
  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  await withServer(createApp({ react: stub }, { conversations }), async (server) => {
    const first = await request(server, { message: "m0" });
    assert.equal((first.json as { metrics: { historyMessages: number } }).metrics.historyMessages, 0);

    const id = (first.json as { conversationId: string }).conversationId;
    conversations.append(id, "user", "extra-u");
    conversations.append(id, "assistant", "extra-a");
    // after first turn store has user+assistant (2); plus 2 extras = 4 before next request's lastMessages
    // Actually first turn already appended user+assistant. Then we append 2 more = 4 history on next call.
    // For historyMessages === 3 we need exactly 3 prior messages.
    const id3 = conversations.create();
    conversations.append(id3, "user", "a");
    conversations.append(id3, "assistant", "b");
    conversations.append(id3, "user", "c");
    const third = await request(server, { message: "next", conversationId: id3 });
    assert.equal((third.json as { metrics: { historyMessages: number } }).metrics.historyMessages, 3);

    const id12 = conversations.create();
    for (let index = 0; index < 15; index += 1) {
      conversations.append(id12, index % 2 === 0 ? "user" : "assistant", `h${index}`);
    }
    const capped = await request(server, { message: "current", conversationId: id12 });
    assert.equal((capped.json as { metrics: { historyMessages: number } }).metrics.historyMessages, HISTORY_WINDOW);
    const lines = lastInput.split("\n");
    assert.equal(lines.length, HISTORY_WINDOW + 1);
    assert.equal(lines.at(-1), "user: current");
    assert.equal(lines[0], "assistant: h3");
  });
});
