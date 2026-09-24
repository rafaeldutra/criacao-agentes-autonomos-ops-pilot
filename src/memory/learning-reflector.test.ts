import test from "node:test";
import assert from "node:assert/strict";
import {
  LEARNING_FIXTURES,
  LEARNING_SYSTEM_PROMPT,
  createFixtureLearningReflector,
  learningVerdictSchema,
  scheduleLearning,
  shouldRemember,
} from "./learning-reflector.js";
import type { MemoryStore, RememberResult } from "./memory-store.js";

test("shouldRemember requires hasLearning and non-empty fact", () => {
  assert.equal(shouldRemember({ hasLearning: true, fact: "likes coffee" }), true);
  assert.equal(shouldRemember({ hasLearning: true, fact: "  " }), false);
  assert.equal(shouldRemember({ hasLearning: false, fact: "x" }), false);
});

test("learningVerdictSchema rejects hasLearning true with empty fact", () => {
  assert.throws(() => learningVerdictSchema.parse({ hasLearning: true, fact: "  " }));
  assert.deepEqual(learningVerdictSchema.parse({ hasLearning: false, fact: "" }), {
    hasLearning: false,
    fact: "",
  });
});

test("LEARNING_SYSTEM_PROMPT covers durable / one-shot / secret rules", () => {
  assert.match(LEARNING_SYSTEM_PROMPT, /durable/i);
  assert.match(LEARNING_SYSTEM_PROMPT, /one-shot|Never learn one-shot/i);
  assert.match(LEARNING_SYSTEM_PROMPT, /secret/i);
});

test("fixture reflector maps preference / one-shot / secret", async () => {
  const reflect = createFixtureLearningReflector();
  assert.equal((await reflect(LEARNING_FIXTURES.preference)).hasLearning, true);
  assert.equal((await reflect(LEARNING_FIXTURES.oneShot)).hasLearning, false);
  assert.equal((await reflect(LEARNING_FIXTURES.secret)).hasLearning, false);
});

test("scheduleLearning remembers once on positive verdict", async () => {
  let calls = 0;
  let rememberedFact = "";
  const memories = {
    remember: async (_userId: string, fact: string): Promise<RememberResult> => {
      calls += 1;
      rememberedFact = fact;
      return { id: "1", created: true };
    },
    recall: async () => [],
    forget: () => undefined,
    close: () => undefined,
  } satisfies MemoryStore;

  await new Promise<void>((resolve, reject) => {
    scheduleLearning({
      userId: "u1",
      userMessage: LEARNING_FIXTURES.preference,
      memories,
      reflect: createFixtureLearningReflector(),
      onError: reject,
    });
    setTimeout(() => {
      try {
        assert.equal(calls, 1);
        assert.match(rememberedFact, /Portuguese/i);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 20);
  });
});

test("scheduleLearning skips remember when hasLearning is false", async () => {
  let calls = 0;
  const memories = {
    remember: async () => {
      calls += 1;
      return { id: "1", created: true };
    },
    recall: async () => [],
    forget: () => undefined,
    close: () => undefined,
  } satisfies MemoryStore;

  await new Promise<void>((resolve, reject) => {
    scheduleLearning({
      userId: "u1",
      userMessage: LEARNING_FIXTURES.oneShot,
      memories,
      reflect: createFixtureLearningReflector(),
      onError: reject,
    });
    setTimeout(() => {
      try {
        assert.equal(calls, 0);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 20);
  });
});

test("scheduleLearning skips invalid fact and reports errors via onError", async () => {
  let calls = 0;
  const memories = {
    remember: async () => {
      calls += 1;
      return { id: "1", created: true };
    },
    recall: async () => [],
    forget: () => undefined,
    close: () => undefined,
  } satisfies MemoryStore;

  await new Promise<void>((resolve, reject) => {
    scheduleLearning({
      userId: "u1",
      userMessage: "x",
      memories,
      reflect: async () => ({ hasLearning: true, fact: "   " }),
      onError: reject,
    });
    setTimeout(() => {
      try {
        assert.equal(calls, 0);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, 20);
  });

  await new Promise<void>((resolve, reject) => {
    scheduleLearning({
      userId: "u1",
      userMessage: LEARNING_FIXTURES.preference,
      memories: {
        ...memories,
        remember: async () => {
          throw new Error("store failed");
        },
      },
      reflect: createFixtureLearningReflector(),
      onError: (error) => {
        try {
          assert.match(String(error), /store failed/);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      },
    });
  });
});
