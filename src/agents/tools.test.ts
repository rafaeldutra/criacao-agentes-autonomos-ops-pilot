import test from "node:test";
import assert from "node:assert/strict";
import { createSeededStore } from "./store.js";
import { createTools } from "./tools.js";

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
