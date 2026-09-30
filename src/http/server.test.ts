import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createFakeHistorySummarizer } from "./server.js";
import { HISTORY_WINDOW, formatHistoryOnly } from "./chat-history.js";
import type { Metrics, ReasoningStrategy } from "../agents/types.js";
import { estimateTokens } from "../context/tokens.js";
import { FakeMemoryStore } from "../memory/fake-memory-store.js";
import { formatMemoryBlock } from "../memory/memory-prompt.js";
import { FakeConversationStore } from "../store/fake-conversation-store.js";
import {
  LEARNING_FIXTURES,
  createFixtureLearningReflector,
} from "../memory/learning-reflector.js";
import type { MemoryStore, RememberResult } from "../memory/memory-store.js";

const result = (answer: string, metrics: Partial<Metrics> = {}) => ({
  answer,
  trace: [{ type: "answer" as const, content: answer }],
  metrics: {
    llmCalls: 1,
    latencyMs: 0,
    historyMessages: 0,
    memoryFacts: 0,
    learningQueued: false,
    ...metrics,
  },
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

test("reports historyMessages 0, 3, and caps injected history at HISTORY_WINDOW", async () => {
  const conversations = new FakeConversationStore();
  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  await withServer(createApp({ react: stub }, { conversations }), async (server) => {
    const first = await request(server, { message: "m0" });
    assert.equal((first.json as { metrics: { historyMessages: number } }).metrics.historyMessages, 0);

    const id3 = conversations.create();
    conversations.append(id3, "user", "a");
    conversations.append(id3, "assistant", "b");
    conversations.append(id3, "user", "c");
    const third = await request(server, { message: "next", conversationId: id3 });
    assert.equal((third.json as { metrics: { historyMessages: number } }).metrics.historyMessages, 3);

    const idCap = conversations.create();
    for (let index = 0; index < 15; index += 1) {
      conversations.append(idCap, index % 2 === 0 ? "user" : "assistant", `h${index}`);
    }
    const capped = await request(server, { message: "current", conversationId: idCap });
    assert.equal((capped.json as { metrics: { historyMessages: number } }).metrics.historyMessages, HISTORY_WINDOW);
    const lines = lastInput.split("\n");
    assert.equal(lines.length, HISTORY_WINDOW + 1);
    assert.equal(lines.at(-1), "user: current");
    // 15 msgs indices 0..14; last 8 are 7..14 → first is assistant:h7
    assert.equal(lines[0], "assistant: h7");
  });
});

test("injects recalled memories when userId is present", async () => {
  const conversations = new FakeConversationStore();
  const unit = new Float32Array(384);
  unit[0] = 1;
  const memories = new FakeMemoryStore({ embed: async () => unit });
  await memories.remember("ops-1", "User prefers black coffee");

  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  await withServer(createApp({ react: stub }, { conversations, memories }), async (server) => {
    const response = await request(server, { message: "coffee prefs?", userId: "ops-1" });
    assert.equal(response.status, 200);
    const body = response.json as { metrics: { memoryFacts: number; historyMessages: number } };
    assert.equal(body.metrics.memoryFacts, 1);
    assert.equal(body.metrics.historyMessages, 0);
    assert.match(lastInput, /\[Relevant memories\]/);
    assert.match(lastInput, /User prefers black coffee/);
  });
});

test("omitting userId yields memoryFacts 0 and keeps conversation behavior", async () => {
  const conversations = new FakeConversationStore();
  const unit = new Float32Array(384);
  unit[0] = 1;
  const memories = new FakeMemoryStore({ embed: async () => unit });
  await memories.remember("ops-1", "secret fact");

  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  await withServer(createApp({ react: stub }, { conversations, memories }), async (server) => {
    const response = await request(server, { message: "hello" });
    assert.equal(response.status, 200);
    const body = response.json as { conversationId: string; metrics: { memoryFacts: number } };
    assert.ok(body.conversationId);
    assert.equal(body.metrics.memoryFacts, 0);
    assert.doesNotMatch(lastInput, /Relevant memories/);
  });
});

test("rejects blank userId with 400", async () => {
  await withServer(createApp({ react: strategy("react") }), async (server) => {
    const response = await request(server, { message: "hello", userId: "   " });
    assert.equal(response.status, 400);
  });
});

test("queues learning after response without awaiting remember", async () => {
  let resolveRemember!: () => void;
  const rememberGate = new Promise<void>((resolve) => {
    resolveRemember = resolve;
  });
  let completedRemember = false;

  const memories: MemoryStore = {
    remember: async (): Promise<RememberResult> => {
      await rememberGate;
      completedRemember = true;
      return { id: "mem-1", created: true };
    },
    recall: async () => [],
    forget: () => undefined,
    close: () => undefined,
  };

  const stub = strategy("react", async () => result("ok"));
  await withServer(
    createApp(
      { react: stub },
      { memories, learningReflector: createFixtureLearningReflector() },
    ),
    async (server) => {
      const response = await request(server, {
        message: LEARNING_FIXTURES.preference,
        userId: "learner-1",
      });
      assert.equal(response.status, 200);
      assert.equal((response.json as { metrics: { learningQueued: boolean } }).metrics.learningQueued, true);
      assert.equal(completedRemember, false);
      resolveRemember();
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(completedRemember, true);
    },
  );
});

test("omitting userId does not queue learning", async () => {
  let rememberCalls = 0;
  const memories: MemoryStore = {
    remember: async () => {
      rememberCalls += 1;
      return { id: "x", created: true };
    },
    recall: async () => [],
    forget: () => undefined,
    close: () => undefined,
  };

  await withServer(
    createApp(
      { react: strategy("react") },
      { memories, learningReflector: createFixtureLearningReflector() },
    ),
    async (server) => {
      const response = await request(server, { message: LEARNING_FIXTURES.preference });
      assert.equal(response.status, 200);
      assert.equal((response.json as { metrics: { learningQueued: boolean } }).metrics.learningQueued, false);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(rememberCalls, 0);
    },
  );
});

test("exposes real promptTokens and estimated contextBreakdown", async () => {
  const conversations = new FakeConversationStore();
  const unit = new Float32Array(384);
  unit[0] = 1;
  const memories = new FakeMemoryStore({ embed: async () => unit });
  await memories.remember("ops-ctx", "User prefers black coffee");

  const cid = conversations.create();
  conversations.append(cid, "user", "earlier");
  conversations.append(cid, "assistant", "ack");

  const history = conversations.lastMessages(cid, HISTORY_WINDOW);
  const facts = await memories.recall("ops-ctx", "coffee prefs?");
  const memoryText = formatMemoryBlock(facts);
  const historyText = formatHistoryOnly(history);
  const messageText = "user: coffee prefs?";

  const stub = strategy("react", async () => result("ok", { promptTokens: 99 }));

  await withServer(createApp({ react: stub }, { conversations, memories }), async (server) => {
    const response = await request(server, {
      message: "coffee prefs?",
      userId: "ops-ctx",
      conversationId: cid,
    });
    assert.equal(response.status, 200);
    const body = response.json as {
      metrics: {
        promptTokens?: number;
        contextBreakdown: { memory: number; history: number; message: number };
        historyMessages: number;
        memoryFacts: number;
        learningQueued: boolean;
      };
    };
    assert.equal(body.metrics.promptTokens, 99);
    assert.deepEqual(body.metrics.contextBreakdown, {
      memory: estimateTokens(memoryText),
      history: estimateTokens(historyText),
      message: estimateTokens(messageText),
      summary: 0,
    });
    assert.equal(body.metrics.historyMessages, 2);
    assert.equal(body.metrics.memoryFacts, 1);
    assert.equal(body.metrics.learningQueued, true);
  });
});

test("omits promptTokens when strategy has no usage but still returns contextBreakdown", async () => {
  const conversations = new FakeConversationStore();
  const stub = strategy("react", async () => result("ok"));

  await withServer(createApp({ react: stub }, { conversations }), async (server) => {
    const response = await request(server, { message: "hello" });
    assert.equal(response.status, 200);
    const body = response.json as {
      metrics: {
        promptTokens?: number;
        contextBreakdown: { memory: number; history: number; message: number };
      };
    };
    assert.equal(body.metrics.promptTokens, undefined);
    assert.ok(!("promptTokens" in body.metrics) || body.metrics.promptTokens === undefined);
    assert.deepEqual(body.metrics.contextBreakdown, {
      memory: 0,
      history: 0,
      message: estimateTokens("user: hello"),
      summary: 0,
    });
  });
});

test("injects conversation summary into strategy input", async () => {
  const conversations = new FakeConversationStore();
  const cid = conversations.create();
  conversations.upsertSummary(cid, "freeze termina dia 15", 8);
  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  await withServer(createApp({ react: stub }, { conversations }), async (server) => {
    const response = await request(server, { message: "status", conversationId: cid });
    assert.equal(response.status, 200);
    assert.match(lastInput, /\[Conversation summary\]/);
    assert.match(lastInput, /freeze termina dia 15/);
    const body = response.json as {
      metrics: { contextBreakdown: { summary: number }; historyMessages: number };
      trace: Array<{ type: string }>;
    };
    assert.ok(body.metrics.contextBreakdown.summary > 0);
    assert.equal(body.metrics.historyMessages, 0);
    assert.equal(body.trace.some((event) => event.type === "summarize"), false);
  });
});

test("summarizes a full batch after turn and emits summarize trace event", async () => {
  const conversations = new FakeConversationStore();
  const cid = conversations.create();
  for (let index = 0; index < 14; index += 1) {
    conversations.append(cid, index % 2 === 0 ? "user" : "assistant", `m${index}`);
  }
  const fake = createFakeHistorySummarizer();
  const stub = strategy("react", async () => result("ok"));

  await withServer(
    createApp({ react: stub }, { conversations, historySummarizer: fake }),
    async (server) => {
      const response = await request(server, { message: "next", conversationId: cid });
      assert.equal(response.status, 200);
      // pre-append had 14; +user+assistant => 16 → first batch fires
      assert.equal(fake.calls.length, 1);
      const body = response.json as { trace: Array<{ type: string; content?: string }> };
      const event = body.trace.find((item) => item.type === "summarize");
      assert.ok(event);
      assert.match(String(event.content), /^NEW:/);
      assert.equal(conversations.getSummary(cid)?.coveredCount, 8);
    },
  );
});

test("does not summarize on incomplete batch and survives summarizer failure", async () => {
  const conversations = new FakeConversationStore();
  const cid = conversations.create();
  for (let index = 0; index < 10; index += 1) {
    conversations.append(cid, index % 2 === 0 ? "user" : "assistant", `m${index}`);
  }
  const fake = createFakeHistorySummarizer();
  const stub = strategy("react", async () => result("ok"));

  await withServer(
    createApp({ react: stub }, { conversations, historySummarizer: fake }),
    async (server) => {
      const response = await request(server, { message: "mid", conversationId: cid });
      assert.equal(response.status, 200);
      // 10 + 2 = 12 → outside window = 4 < 8
      assert.equal(fake.calls.length, 0);
      assert.equal(
        (response.json as { trace: Array<{ type: string }> }).trace.some((event) => event.type === "summarize"),
        false,
      );
    },
  );

  const cidFail = conversations.create();
  for (let index = 0; index < 14; index += 1) {
    conversations.append(cidFail, index % 2 === 0 ? "user" : "assistant", `f${index}`);
  }
  await withServer(
    createApp(
      { react: stub },
      {
        conversations,
        historySummarizer: async () => {
          throw new Error("summarizer down");
        },
      },
    ),
    async (server) => {
      const response = await request(server, { message: "go", conversationId: cidFail });
      assert.equal(response.status, 200);
      assert.equal(conversations.getSummary(cidFail), undefined);
      assert.equal(
        (response.json as { trace: Array<{ type: string }> }).trace.some((event) => event.type === "summarize"),
        false,
      );
    },
  );
});
