import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp as createExpressApp, createFakeHistorySummarizer, type ChatServerOptions } from "./server.js";
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
import type { AgentRegistry } from "../agents/index.js";
import { ModelUnavailableError } from "../agents/model.js";
import { recordFallback, recordModelUsed } from "../agents/model-usage.js";
import { createCapturingLogger } from "../obs/test-logger.js";
import { FakeRequestStore } from "../store/fake-request-store.js";
import type { RequestDetail, RequestStore } from "../store/request-store.js";

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

const request = async (
  server: Server,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown; requestId: string | null }> => {
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json(), requestId: response.headers.get("x-request-id") };
};

const rawRequest = async (
  server: Server,
  body: string,
): Promise<{ status: number; json: unknown; text: string; requestId: string | null }> => {
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await response.text();
  return { status: response.status, text, json: JSON.parse(text), requestId: response.headers.get("x-request-id") };
};

const getRequest = async (
  server: Server,
  id: string,
): Promise<{ status: number; json: unknown; requestId: string | null }> => {
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/requests/${id}`);
  return { status: response.status, json: await response.json(), requestId: response.headers.get("x-request-id") };
};

/** Persistence and request.end run on "finish"; poll briefly instead of assuming ordering with fetch. */
const eventually = async <T>(read: () => T | undefined): Promise<T> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error("condition not reached");
};

const withServer = async (
  app: ReturnType<typeof createExpressApp>,
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

/** All suites go through here: deterministic router and a capturing logger (no stdout/stderr noise). */
const createApp = (registry: AgentRegistry, options: ChatServerOptions = {}) =>
  createExpressApp(registry, {
    decideRoute: async () => ({ route: "react", reason: "test router" }),
    logger: createCapturingLogger().logger,
    ...options,
  });

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

test("exposes metrics.modelUsed recorded during the turn", async () => {
  const stub = strategy("react", async () => {
    recordModelUsed("primary/model");
    return result("ok");
  });
  await withServer(createApp({ react: stub }), async (server) => {
    const response = await request(server, { message: "status" });
    assert.equal(response.status, 200);
    assert.equal((response.json as { metrics: { modelUsed?: string } }).metrics.modelUsed, "primary/model");
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

test("uses strategy as graph override without calling decideRoute", async () => {
  let routed = false;
  let planRan = false;
  await withServer(
    createApp(
      {
        react: strategy("react"),
        "plan-and-execute": strategy("plan-and-execute", async () => {
          planRan = true;
          return result("planned");
        }),
      },
      {
        decideRoute: async () => {
          routed = true;
          return { route: "react", reason: "should not run" };
        },
      },
    ),
    async (server) => {
      const response = await request(server, { message: "status", strategy: "plan-and-execute" });
      assert.equal(response.status, 200);
      assert.equal((response.json as { answer: string }).answer, "planned");
      assert.equal(planRan, true);
      assert.equal(routed, false);
      const routeEvent = (response.json as { trace: Array<{ type: string; reason?: string }> }).trace.find(
        (event) => event.type === "route",
      );
      assert.equal(routeEvent?.reason, "client override");
    },
  );
});

test("strategy team runs the team strategy and returns its handoffs", async () => {
  const team = strategy("team", async () => ({
    ...result("Incidente aberto."),
    trace: [
      { type: "handoff", from: "supervisor", to: "analista", brief: "fatos", node: "supervisor" },
      { type: "handoff", from: "supervisor", to: "done", brief: "Incidente aberto.", node: "supervisor" },
      { type: "answer", content: "Incidente aberto." },
    ],
  }));
  await withServer(createApp({ react: strategy("react"), team }), async (server) => {
    const response = await request(server, { message: "checkout", strategy: "team" });
    assert.equal(response.status, 200);
    const body = response.json as { answer: string; route: string; trace: Array<{ type: string; to?: string; node?: string }> };
    assert.equal(body.answer, "Incidente aberto.");
    assert.equal(body.route, "team");
    assert.deepEqual(
      body.trace.filter((event) => event.type === "handoff").map((event) => [event.to, event.node]),
      [["analista", "supervisor"], ["done", "supervisor"]],
    );
  });
});

test("maps router failure to 502", async () => {
  await withServer(
    createApp(
      { react: strategy("react") },
      {
        decideRoute: async () => {
          throw new Error("router down");
        },
      },
    ),
    async (server) => {
      const response = await request(server, { message: "status" });
      assert.equal(response.status, 502);
      assert.equal((response.json as { code: string }).code, "ROUTER_FAILED");
    },
  );
});

test("maps total model failure to 503 without leaking provider details", async () => {
  const conversations = new FakeConversationStore();
  const failing = strategy("react", async () => {
    throw new ModelUnavailableError({ cause: new Error("secret provider detail") });
  });
  const cid = conversations.create();
  await withServer(createApp({ react: failing }, { conversations }), async (server) => {
    const response = await rawRequest(server, JSON.stringify({ message: "status", conversationId: cid }));
    assert.equal(response.status, 503);
    assert.deepEqual(response.json, {
      requestId: response.requestId,
      error: "Language model service unavailable",
      code: "MODEL_SERVICE_UNAVAILABLE",
    });
    assert.doesNotMatch(response.text, /secret provider detail|stack/);
    assert.deepEqual(conversations.lastMessages(cid, HISTORY_WINDOW).map((message) => message.role), ["user"]);
  });

  await withServer(
    createApp(
      { react: strategy("react") },
      {
        decideRoute: async () => {
          throw new ModelUnavailableError();
        },
      },
    ),
    async (server) => {
      const response = await request(server, { message: "status" });
      assert.equal(response.status, 503);
      assert.equal((response.json as { code: string }).code, "MODEL_SERVICE_UNAVAILABLE");
    },
  );
});

test("timeout still wins over a later model failure", async () => {
  const slowFailure = strategy("react", async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    throw new ModelUnavailableError();
  });
  await withServer(createApp({ react: slowFailure }, { timeoutMs: 5 }), async (server) => {
    const response = await request(server, { message: "status" });
    assert.equal(response.status, 504);
  });
});

test("returns JSON for malformed bodies and provider failures", async () => {
  await withServer(createApp({ react: strategy("react") }), async (server) => {
    const malformed = await rawRequest(server, "{message}");
    assert.equal(malformed.status, 400);
    assert.equal((malformed.json as { error: string }).error, "Invalid JSON body");
    assert.doesNotMatch(malformed.text, /<!DOCTYPE/i);
  });

  await withServer(
    createApp({
      react: strategy("react", async () => {
        throw new Error("Provider returned error");
      }),
    }),
    async (server) => {
      const response = await request(server, { message: "status" });
      assert.equal(response.status, 502);
      assert.equal((response.json as { code: string }).code, "PROVIDER_ERROR");
    },
  );
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

test("low window budget drops oldest history from strategy prompt", async () => {
  const conversations = new FakeConversationStore();
  const cid = conversations.create();
  conversations.append(cid, "user", "OLD_MESSAGE_AAAAAAAA");
  conversations.append(cid, "assistant", "OLD_REPLY_BBBBBBBB");
  conversations.append(cid, "user", "NEW_MESSAGE_CCCCCCCC");

  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  const onlyNewestTokens = estimateTokens("user: NEW_MESSAGE_CCCCCCCC");
  await withServer(
    createApp(
      { react: stub },
      {
        conversations,
        sectionBudget: { summary: 200, window: onlyNewestTokens, memories: 300 },
      },
    ),
    async (server) => {
      const response = await request(server, {
        message: "current",
        conversationId: cid,
      });
      assert.equal(response.status, 200);
      const body = response.json as { metrics: { historyMessages: number } };
      assert.equal(body.metrics.historyMessages, 1);
      assert.doesNotMatch(lastInput, /OLD_MESSAGE_AAAAAAAA/);
      assert.match(lastInput, /NEW_MESSAGE_CCCCCCCC/);
      assert.match(lastInput, /user: current/);
    },
  );
});

test("low memories budget reduces memoryFacts in metrics", async () => {
  const conversations = new FakeConversationStore();
  const unit = new Float32Array(384);
  unit[0] = 1;
  const memories = new FakeMemoryStore({ embed: async () => unit });
  await memories.remember("ops-budget", "User prefers black coffee every morning without sugar");
  await memories.remember("ops-budget", "User likes green tea in the afternoon sometimes");

  let lastInput = "";
  const stub = strategy("react", async (input) => {
    lastInput = input;
    return result("ok");
  });

  await withServer(
    createApp(
      { react: stub },
      {
        conversations,
        memories,
        sectionBudget: { summary: 0, window: 10_000, memories: 15 },
      },
    ),
    async (server) => {
      const response = await request(server, {
        message: "coffee prefs?",
        userId: "ops-budget",
      });
      assert.equal(response.status, 200);
      const body = response.json as { metrics: { memoryFacts: number } };
      assert.ok(body.metrics.memoryFacts <= 2);
      assert.ok(body.metrics.memoryFacts >= 0);
      // With a tight budget, at most one formatted fact block typically remains
      assert.ok(body.metrics.memoryFacts <= 1);
      assert.match(lastInput, /user: coffee prefs\?/);
    },
  );
});

// --- 013: requestId, persisted trace and structured logs ---

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Scenario = {
  name: string;
  status: number;
  errorCode?: string;
  registry?: AgentRegistry;
  options?: ChatServerOptions;
  send: (server: Server) => Promise<{ status: number; json: unknown; requestId: string | null }>;
};

const scenarios: Scenario[] = [
  { name: "200", status: 200, send: (server) => request(server, { message: "status" }) },
  { name: "400 invalid JSON", status: 400, errorCode: "INVALID_JSON", send: (server) => rawRequest(server, "{message}") },
  { name: "400 Zod", status: 400, errorCode: "VALIDATION_ERROR", send: (server) => request(server, { message: "" }) },
  {
    name: "404 conversation",
    status: 404,
    errorCode: "CONVERSATION_NOT_FOUND",
    send: (server) => request(server, { message: "hi", conversationId: "conv-missing" }),
  },
  {
    name: "422 strategy",
    status: 422,
    errorCode: "UNKNOWN_STRATEGY",
    send: (server) => request(server, { message: "hi", strategy: "nope" }),
  },
  {
    name: "502 router",
    status: 502,
    errorCode: "ROUTER_FAILED",
    options: {
      decideRoute: async () => {
        throw new Error("router down");
      },
    },
    send: (server) => request(server, { message: "hi" }),
  },
  {
    name: "502 provider",
    status: 502,
    errorCode: "PROVIDER_ERROR",
    registry: {
      react: strategy("react", async () => {
        throw new Error("Provider returned error");
      }),
    },
    send: (server) => request(server, { message: "hi" }),
  },
  {
    name: "503 model unavailable",
    status: 503,
    errorCode: "MODEL_SERVICE_UNAVAILABLE",
    registry: {
      react: strategy("react", async () => {
        throw new ModelUnavailableError();
      }),
    },
    send: (server) => request(server, { message: "hi" }),
  },
  {
    name: "504 timeout",
    status: 504,
    errorCode: "CHAT_TIMEOUT",
    registry: {
      react: strategy("react", async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return result("late");
      }),
    },
    options: { timeoutMs: 5 },
    send: (server) => request(server, { message: "hi" }),
  },
  {
    name: "500 unexpected",
    status: 500,
    errorCode: "INTERNAL_ERROR",
    registry: {
      react: strategy("react", async () => {
        throw new Error("unexpected boom");
      }),
    },
    send: (server) => request(server, { message: "hi" }),
  },
];

for (const scenario of scenarios) {
  test(`requestId in header and body, and persisted record, for ${scenario.name}`, async () => {
    const requests = new FakeRequestStore();
    const app = createApp(scenario.registry ?? { react: strategy("react") }, { requests, ...scenario.options });
    await withServer(app, async (server) => {
      const response = await scenario.send(server);
      assert.equal(response.status, scenario.status);
      assert.match(String(response.requestId), UUID);
      assert.equal((response.json as { requestId?: string }).requestId, response.requestId);

      const detail = await eventually(() => requests.get(response.requestId!));
      assert.equal(detail.status, scenario.status);
      assert.equal(detail.errorCode, scenario.errorCode ?? null);
      if (scenario.status === 200) {
        const body = response.json as { trace: unknown[]; conversationId: string; route: string };
        assert.deepEqual(detail.trace, body.trace);
        assert.equal(detail.conversationId, body.conversationId);
        assert.equal(detail.route, body.route);
        assert.equal(detail.metrics?.llmCalls, 1);
      } else {
        assert.deepEqual(detail.trace, []);
        assert.equal(detail.metrics, null);
      }
      assert.ok(Number.isInteger(detail.latencyMs) && detail.latencyMs >= 0);
    });
  });
}

test("requestIds are unique per call and a client X-Request-Id is ignored", async () => {
  await withServer(createApp({ react: strategy("react") }), async (server) => {
    const clientId = "00000000-0000-4000-8000-000000000000";
    const first = await request(server, { message: "a" }, { "x-request-id": clientId });
    const second = await request(server, { message: "b" });
    assert.notEqual(first.requestId, clientId);
    assert.notEqual(first.requestId, second.requestId);
    assert.match(String(second.requestId), UUID);
  });
});

test("persists the full trace including post-graph summarize and fallback events, plus request fields", async () => {
  const requests = new FakeRequestStore();
  const conversations = new FakeConversationStore();
  const cid = conversations.create();
  for (let index = 0; index < 14; index += 1) {
    conversations.append(cid, index % 2 === 0 ? "user" : "assistant", `m${index}`);
  }
  const app = createApp(
    { react: strategy("react", async () => result("ok", { promptTokens: 42 })) },
    {
      requests,
      conversations,
      historySummarizer: createFakeHistorySummarizer(),
      decideRoute: async () => {
        recordFallback({ fromModel: "primary/m", toModel: "backup/m", reason: "429" });
        return { route: "react", reason: "test router" };
      },
    },
  );
  await withServer(app, async (server) => {
    const response = await request(server, { message: "next", conversationId: cid, userId: "u1", reflect: false });
    assert.equal(response.status, 200);
    const body = response.json as { trace: Array<{ type: string }> };
    assert.ok(body.trace.some((event) => event.type === "fallback"));
    assert.equal(body.trace.at(-1)?.type, "summarize");

    const detail = await eventually(() => requests.get(response.requestId!));
    assert.deepEqual(detail.trace, body.trace);
    assert.equal(detail.conversationId, cid);
    assert.equal(detail.userId, "u1");
    assert.equal(detail.reflect, false);
    assert.equal(detail.metrics?.promptTokens, 42);
  });
});

test("a failing request store does not change the chat response and logs request.persist_failed", async () => {
  const strip = (json: unknown) => {
    const { requestId: _requestId, conversationId: _conversationId, ...rest } = json as Record<string, unknown>;
    // latencyMs is wall-clock and differs between the two runs.
    const { latencyMs: _latencyMs, ...metrics } = rest.metrics as Record<string, unknown>;
    return { ...rest, metrics };
  };
  const failing: RequestStore = {
    record: () => {
      throw new Error("disk full\nat stack line");
    },
    get: () => undefined,
    listSince: () => [],
    close: () => undefined,
  };
  const capture = createCapturingLogger();
  const stub = { react: strategy("react", async () => result("same")) };

  let healthy: { status: number; json: unknown } | undefined;
  await withServer(createApp(stub), async (server) => {
    healthy = await request(server, { message: "status" });
  });
  await withServer(createApp(stub, { requests: failing, logger: capture.logger }), async (server) => {
    const response = await request(server, { message: "status" });
    assert.equal(response.status, healthy?.status);
    assert.deepEqual(strip(response.json), strip(healthy?.json));
    const failure = await eventually(() =>
      capture.entries().find((entry) => entry.event === "request.persist_failed"),
    );
    assert.equal(failure.level, "error");
    assert.equal(failure.requestId, response.requestId);
    assert.equal(failure.errorMessage, "disk full");
  });
});

test("GET /requests/:id returns the recorded request with the same trace", async () => {
  const requests = new FakeRequestStore();
  await withServer(createApp({ react: strategy("react") }, { requests }), async (server) => {
    const chat = await request(server, { message: "status" });
    const id = chat.requestId!;
    await eventually(() => requests.get(id));

    const found = await getRequest(server, id);
    assert.equal(found.status, 200);
    assert.match(String(found.requestId), UUID);
    assert.notEqual(found.requestId, id);
    const detail = found.json as RequestDetail;
    assert.equal(detail.requestId, id);
    assert.equal(detail.status, 200);
    assert.equal(detail.route, "react");
    assert.equal(detail.metrics?.llmCalls, 1);
    assert.deepEqual(detail.trace, (chat.json as { trace: unknown[] }).trace);
    assert.deepEqual(requests.ids(), [id]);
  });
});

test("GET /requests/:id shows failed chats, 404 for unknown ids and 400 for non-UUIDs", async () => {
  const requests = new FakeRequestStore();
  await withServer(createApp({ react: strategy("react") }, { requests }), async (server) => {
    const chat = await request(server, { message: "hi", conversationId: "conv-missing" });
    const failed = await eventually(() => requests.get(chat.requestId!));
    assert.equal(failed.status, 404);

    const found = await getRequest(server, chat.requestId!);
    assert.equal(found.status, 200);
    assert.deepEqual(found.json, failed);
    assert.equal((found.json as RequestDetail).errorCode, "CONVERSATION_NOT_FOUND");
    assert.equal((found.json as RequestDetail).metrics, null);

    const missingId = "00000000-0000-4000-8000-000000000000";
    const missing = await getRequest(server, missingId);
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.json, { error: `Request not found: ${missingId}`, code: "REQUEST_NOT_FOUND" });
    assert.match(String(missing.requestId), UUID);

    const invalid = await getRequest(server, "abc");
    assert.equal(invalid.status, 400);
    assert.ok(Array.isArray((invalid.json as { issues?: unknown }).issues));
    assert.equal((invalid.json as { requestId?: string }).requestId, undefined);

    assert.deepEqual(requests.ids(), [chat.requestId]);
  });
});

const getStats = async (server: Server, query = ""): Promise<{ status: number; json: unknown }> => {
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/stats${query}`);
  return { status: response.status, json: await response.json() };
};

test("GET /stats aggregates persisted requests inside the window", async () => {
  const requests = new FakeRequestStore();
  const base = { trace: [], conversationId: "c" };
  requests.record({
    ...base,
    requestId: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-10-13T11:00:00.000Z",
    route: "react",
    status: 200,
    latencyMs: 100,
    metrics: { llmCalls: 1, promptTokens: 2_000_000, modelUsed: "paid/m", historyMessages: 0, memoryFacts: 0 },
  });
  requests.record({
    ...base,
    requestId: "00000000-0000-4000-8000-000000000002",
    createdAt: "2026-10-13T11:30:00.000Z",
    route: "plan-and-execute",
    status: 200,
    latencyMs: 300,
    metrics: { llmCalls: 9, promptTokens: 9000, modelUsed: "x/y:free", historyMessages: 0, memoryFacts: 0 },
  });
  requests.record({
    ...base,
    requestId: "00000000-0000-4000-8000-000000000003",
    createdAt: "2026-10-13T11:45:00.000Z",
    status: 504,
    errorCode: "CHAT_TIMEOUT",
    latencyMs: 180_000,
  });
  // Outside a 1h window.
  requests.record({
    ...base,
    requestId: "00000000-0000-4000-8000-000000000004",
    createdAt: "2026-10-13T10:59:59.999Z",
    route: "react",
    status: 200,
    latencyMs: 1,
  });

  const app = createApp(
    { react: strategy("react") },
    { requests, modelPrices: { "paid/m": 0.5 }, now: () => new Date("2026-10-13T12:00:00.000Z") },
  );
  await withServer(app, async (server) => {
    const hour = await getStats(server, "?since=1h");
    assert.equal(hour.status, 200);
    const stats = hour.json as {
      since: string;
      from: string;
      total: number;
      errors: number;
      promptTokens: number;
      costUsd: number;
      latencyMs: { p50: number; p95: number };
      byRoute: Record<string, { total: number; errors: number }>;
      byModel: Record<string, { costUsd: number }>;
    };
    assert.equal(stats.since, "1h");
    assert.equal(stats.from, "2026-10-13T11:00:00.000Z");
    assert.equal(stats.total, 3);
    assert.equal(stats.errors, 1);
    assert.equal(stats.promptTokens, 2_009_000);
    assert.equal(stats.costUsd, 1);
    assert.deepEqual(stats.latencyMs, { p50: 300, p95: 180_000 });
    assert.deepEqual(stats.byRoute.unknown, { ...stats.byRoute.unknown, total: 1, errors: 1 });
    assert.equal(stats.byModel["x/y:free"]?.costUsd, 0);
    assert.equal(stats.byModel["paid/m"]?.costUsd, 1);

    const day = await getStats(server);
    assert.equal((day.json as { since: string; total: number }).since, "24h");
    assert.equal((day.json as { total: number }).total, 4);

    const invalid = await getStats(server, "?since=1w");
    assert.equal(invalid.status, 400);
    assert.equal((invalid.json as { code: string }).code, "INVALID_WINDOW");
  });
  // /stats itself is not persisted.
  assert.equal(requests.ids().length, 4);
});

test("logs one JSON line per event with metadata only and never content", async () => {
  const markers = {
    message: "MARK-MESSAGE-7f3a",
    answer: "MARK-ANSWER-91bc",
    thought: "MARK-THOUGHT-22d1",
    observation: "MARK-OBS-5e0f",
    arg: "MARK-ARG-c4a8",
    routeReason: "MARK-ROUTE-3b77",
    fallbackReason: "MARK-FALLBACK-aa19",
  };
  const capture = createCapturingLogger();
  const stub = strategy("react", async () => ({
    answer: markers.answer,
    trace: [
      { type: "thought" as const, content: markers.thought },
      { type: "action" as const, tool: "list_incidents", args: { filter: markers.arg } },
      { type: "observation" as const, content: markers.observation },
      { type: "answer" as const, content: markers.answer },
    ],
    metrics: { llmCalls: 2, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false, promptTokens: 321 },
  }));
  const app = createApp(
    { react: stub },
    {
      logger: capture.logger,
      decideRoute: async () => {
        recordFallback({ fromModel: "primary/m", toModel: "backup/m", reason: markers.fallbackReason });
        return { route: "react", reason: markers.routeReason };
      },
    },
  );

  await withServer(app, async (server) => {
    const chat = await request(server, { message: markers.message });
    assert.equal(chat.status, 200);
    const id = chat.requestId!;
    const trace = (chat.json as { trace: Array<{ type: string }> }).trace;
    await eventually(() => capture.entries().find((entry) => entry.event === "request.end" && entry.requestId === id));

    const entries = capture.lines.map((line) => {
      assert.equal(line.indexOf("\n"), line.length - 1);
      return JSON.parse(line) as Record<string, unknown>;
    });
    const mine = entries.filter((entry) => entry.requestId === id);
    assert.ok(mine.every((entry) => typeof entry.ts === "string" && typeof entry.level === "string"));
    assert.deepEqual(
      mine.map((entry) => entry.event),
      ["request.start", ...trace.map(() => "trace.event"), "request.end"],
    );
    assert.deepEqual(
      mine.filter((entry) => entry.event === "trace.event").map((entry) => [entry.seq, entry.type]),
      trace.map((event, seq) => [seq, event.type]),
    );
    const action = mine.find((entry) => entry.type === "action");
    assert.equal(action?.tool, "list_incidents");
    assert.equal(action?.argKeys, 1);
    const end = mine.at(-1)!;
    assert.equal(end.level, "info");
    assert.equal(end.status, 200);
    assert.equal(end.path, "/chat");
    assert.equal(end.route, "react");
    assert.equal(end.llmCalls, 2);
    assert.equal(end.promptTokens, 321);
    assert.equal(end.traceEvents, trace.length);
    assert.equal(typeof end.latencyMs, "number");

    const all = capture.lines.join("");
    for (const marker of Object.values(markers)) {
      assert.doesNotMatch(all, new RegExp(marker));
    }
  });
});

test("request.end level follows status and GET /requests logs only start and end", async () => {
  const capture = createCapturingLogger();
  const failing = strategy("react", async () => {
    throw new Error("unexpected boom");
  });
  await withServer(createApp({ react: failing }, { logger: capture.logger }), async (server) => {
    const bad = await request(server, { message: "" });
    const boom = await request(server, { message: "x" });
    const lookup = await getRequest(server, "00000000-0000-4000-8000-000000000000");
    const endOf = (id: string | null) =>
      eventually(() => capture.entries().find((entry) => entry.event === "request.end" && entry.requestId === id));

    const badEnd = await endOf(bad.requestId);
    assert.equal(badEnd.level, "warn");
    assert.equal(badEnd.errorCode, "VALIDATION_ERROR");

    const boomEnd = await endOf(boom.requestId);
    assert.equal(boomEnd.level, "error");
    assert.equal(boomEnd.errorCode, "INTERNAL_ERROR");
    const httpError = capture.entries().find((entry) => entry.event === "http.error");
    assert.equal(httpError?.requestId, boom.requestId);

    const lookupEnd = await endOf(lookup.requestId);
    assert.deepEqual(
      capture.entries().filter((entry) => entry.requestId === lookup.requestId).map((entry) => entry.event),
      ["request.start", "request.end"],
    );
    assert.equal(lookupEnd.path, "/requests/00000000-0000-4000-8000-000000000000");
    assert.equal(lookupEnd.level, "warn");
    assert.equal(lookupEnd.errorCode, undefined);
  });
});
