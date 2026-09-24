import test from "node:test";
import assert from "node:assert/strict";
import { createSeededStore } from "./store.js";
import { createTools } from "./tools.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { FakeMemoryStore } from "../memory/fake-memory-store.js";

const providerResponse = (indicator = "none", description = "All Systems Operational") => new Response(
  JSON.stringify({ status: { indicator, description }, page: { unrelated: true } }),
  { status: 200, headers: { "content-type": "application/json" } },
);

const createFakeFetch = (responses: Array<Response | Error>) => {
  const requests: Array<{ url: string; signal?: AbortSignal }> = [];
  let index = 0;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), signal: init?.signal as AbortSignal | undefined });
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { fakeFetch, requests };
};

test("tools validate and mutate the seeded store", async () => {
  const store = createSeededStore();
  const tools = createTools(store);
  assert.equal((await tools.listAlerts.invoke({ status: "firing" })).length, 3);
  const incident = await tools.openIncident.invoke({ title: "Queue outage", service: "worker", severity: "high" });
  assert.equal(incident.status, "open");
  assert.equal((await tools.resolveIncident.invoke({ id: incident.id })).status, "resolved");
});

test("invalid tool input does not mutate state", async () => {
  const store = createSeededStore();
  const tools = createTools(store);
  assert.rejects(() => tools.openIncident.invoke({ title: "", service: "worker", severity: "high" }));
  assert.equal(store.read().incidents.length, 0);
});

test("SQLite-backed tools list incidents and consult runbooks", async () => {
  const store = new SqliteOpsStore(":memory:");
  try {
    const tools = createTools(store);
    assert.deepEqual(await tools.listIncidents.invoke({}), []);
    const incident = await tools.openIncident.invoke({ title: "Checkout outage", service: "checkout", severity: "medium" });
    assert.equal((await tools.listIncidents.invoke({})).at(0)?.id, incident.id);
    assert.equal((await tools.consultRunbook.invoke({ service: "checkout" })).service, "checkout");
    await assert.rejects(() => tools.listIncidents.invoke({ status: "invalid" } as never));
    await assert.rejects(() => tools.consultRunbook.invoke({ service: "unknown" }));
  } finally {
    store.close();
  }
});

test("check_provider_status defaults to GitHub and selects Cloudflare explicitly", async () => {
  const github = createFakeFetch([providerResponse()]);
  const githubTools = createTools(createSeededStore(), { fetch: github.fakeFetch });
  assert.equal(await githubTools.checkProviderStatus.invoke({}), "github: none - All Systems Operational");
  assert.equal(github.requests[0]?.url, "https://www.githubstatus.com/api/v2/status.json");

  const cloudflare = createFakeFetch([providerResponse("minor", "Partial\nOutage")]);
  const cloudflareTools = createTools(createSeededStore(), { fetch: cloudflare.fakeFetch });
  assert.equal(await cloudflareTools.checkProviderStatus.invoke({ provider: "cloudflare" }), "cloudflare: minor - Partial Outage");
  assert.equal(cloudflare.requests[0]?.url, "https://www.cloudflarestatus.com/api/v2/status.json");
});

test("check_provider_status retries network, timeout, and 5xx failures once", async () => {
  for (const firstFailure of [
    new Error("network unavailable"),
    Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    new Response("upstream failure", { status: 503 }),
  ]) {
    const fake = createFakeFetch([firstFailure, providerResponse("minor", "Degraded")]);
    const tools = createTools(createSeededStore(), { fetch: fake.fakeFetch });
    assert.equal(await tools.checkProviderStatus.invoke({ provider: "github" }), "github: minor - Degraded");
    assert.equal(fake.requests.length, 2);
    assert.ok(fake.requests.every((request) => request.signal));
  }
});

test("check_provider_status returns readable final failures without throwing", async () => {
  const exhausted = createFakeFetch([new Error("offline"), new Error("still offline")]);
  const exhaustedTools = createTools(createSeededStore(), { fetch: exhausted.fakeFetch });
  assert.match(await exhaustedTools.checkProviderStatus.invoke({}), /failed after 2 attempts: still offline/);
  assert.equal(exhausted.requests.length, 2);

  const notFound = createFakeFetch([new Response("not found", { status: 404 })]);
  const notFoundTools = createTools(createSeededStore(), { fetch: notFound.fakeFetch });
  assert.equal(await notFoundTools.checkProviderStatus.invoke({}), "github status check failed: HTTP 404");
  assert.equal(notFound.requests.length, 1);

  const invalid = createFakeFetch([new Response(JSON.stringify({ status: { indicator: "" } }), { status: 200 })]);
  const invalidTools = createTools(createSeededStore(), { fetch: invalid.fakeFetch });
  assert.match(await invalidTools.checkProviderStatus.invoke({}), /failed after 1 attempt/);
  assert.equal(invalid.requests.length, 1);
});

test("forget_preference removes matching memory for contextual userId", async () => {
  const unit = new Float32Array(384);
  unit[0] = 1;
  const memories = new FakeMemoryStore({ embed: async () => unit });
  await memories.remember("u1", "User prefers Portuguese replies");

  const tools = createTools(createSeededStore(), {
    memories,
    getUserId: () => "u1",
  });
  assert.ok(tools.forgetPreference);
  assert.equal(tools.forgetPreference.name, "forget_preference");

  const output = await tools.forgetPreference.invoke({ preference: "Portuguese language preference" });
  assert.match(String(output), /Forgotten:/);
  assert.deepEqual(await memories.recall("u1", "Portuguese"), []);
});

test("forget_preference reports no match, missing userId, and missing memories", async () => {
  const unit = new Float32Array(384);
  unit[0] = 1;
  const memories = new FakeMemoryStore({ embed: async () => unit });

  const withUser = createTools(createSeededStore(), { memories, getUserId: () => "u1" });
  assert.equal(
    await withUser.forgetPreference.invoke({ preference: "unknown preference xyz" }),
    "No matching preference found.",
  );

  const noUser = createTools(createSeededStore(), { memories, getUserId: () => undefined });
  assert.equal(
    await noUser.forgetPreference.invoke({ preference: "anything" }),
    "userId is required to forget preferences.",
  );

  const noMemories = createTools(createSeededStore());
  assert.equal(
    await noMemories.forgetPreference.invoke({ preference: "anything" }),
    "Memory store is not configured.",
  );
});
