import test from "node:test";
import assert from "node:assert/strict";
import { createSeededStore } from "./store.js";

test("seed has five services and a balanced alert set", () => {
  const store = createSeededStore();
  const snapshot = store.read();
  assert.equal(snapshot.services.length, 5);
  assert.deepEqual(
    snapshot.services.map((service) => service.name),
    ["api", "checkout", "payments", "catalog", "worker"],
  );
  assert.equal(snapshot.alerts.length, 6);
  assert.equal(store.listAlerts("firing").length, 3);
  assert.equal(store.listAlerts("resolved").length, 3);
});

test("seed is loaded from the JSON database", () => {
  const store = createSeededStore();
  assert.equal(store.read().services[0]?.id, "svc-api");
  assert.equal(store.read().alerts[0]?.id, "alt-001");
});

test("incident lifecycle is explicit", () => {
  const store = createSeededStore();
  const incident = store.openIncident("API outage", "api", "critical");
  assert.equal(incident.status, "open");
  assert.equal(store.resolveIncident(incident.id).status, "resolved");
  assert.throws(() => store.resolveIncident(incident.id), /already resolved/);
});
