import test from "node:test";
import assert from "node:assert/strict";
import { createSeededStore } from "./store.js";
import { createTools } from "./tools.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";

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
