import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { createApp } from "./server.js";
import { createToolExecutor } from "../agents/react.js";
import { createSeededStore } from "../agents/store.js";
import { createTools } from "../agents/tools.js";
import type { ReasoningStrategy } from "../agents/types.js";
import { createCapturingLogger } from "../obs/test-logger.js";

/** The same fixtures the war room tests use; both ends must agree on the shape. */
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(process.cwd(), "specs", "014-war-room-web", "contracts", "fixtures", name), "utf8"));

/** Every key of the fixture must exist in the actual body with a compatible type (extra keys are allowed). */
const assertCovers = (actual: unknown, expected: unknown, path = "$"): void => {
  if (expected === null || actual === null) return;
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} should be an array`);
    return;
  }
  if (typeof expected === "object") {
    assert.equal(typeof actual, "object", `${path} should be an object`);
    for (const key of Object.keys(expected as object)) {
      if (["metrics", "args"].includes(key)) continue; // free-form per turn
      assert.ok(key in (actual as object), `${path}.${key} is missing`);
      assertCovers((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  assert.equal(typeof actual, typeof expected, `${path} type`);
};

const app = () => {
  const store = createSeededStore();
  const incidentId = store.openIncident("Checkout slow", "checkout", "high").id;
  const tools = createTools(store);
  const react: ReasoningStrategy = {
    name: "react",
    run: async () => {
      const observation = await tools.resolveIncident.invoke({ id: incidentId, summary: "rollback", reason: "stable" });
      const content = typeof observation === "string" ? observation : JSON.stringify(observation);
      return {
        answer: content,
        trace: [{ type: "observation", content }, { type: "answer", content }],
        metrics: { llmCalls: 1, latencyMs: 0, historyMessages: 0, memoryFacts: 0, learningQueued: false },
      };
    },
  };
  return createApp({ react }, {
    executeTool: createToolExecutor(tools),
    decideRoute: async () => ({ route: "react", reason: "test router" }),
    logger: createCapturingLogger().logger,
  });
};

const withServer = async (callback: (base: string) => Promise<void>) => {
  const server: Server = createServer(app());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try {
    await callback(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
};

const post = async (url: string, body: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
};

test("the 202, decision 200 and decision 409 bodies cover the contract fixtures", async () => {
  await withServer(async (base) => {
    const pending = await post(`${base}/chat`, { message: "resolva" });
    assert.equal(pending.status, 202);
    assertCovers(pending.json, fixture("chat-202.json"));

    const id = (pending.json.approval as { id: string }).id;
    const decided = await post(`${base}/approvals/${id}/decision`, { decision: "approve" });
    assert.equal(decided.status, 200);
    assertCovers(decided.json, fixture("decision-approve-200.json"));

    const conflict = await post(`${base}/approvals/${id}/decision`, { decision: "deny" });
    assert.equal(conflict.status, 409);
    assertCovers(conflict.json, fixture("decision-409.json"));
  });
});

test("fixture approvals use only the documented status values", () => {
  for (const name of ["chat-202.json", "decision-approve-200.json", "decision-409.json"]) {
    const approval = (fixture(name) as { approval: { status: string } }).approval;
    assert.ok(["pending", "approved", "denied", "failed", "expired"].includes(approval.status), name);
  }
});
