import test from "node:test";
import assert from "node:assert/strict";
import { SqliteOpsStore } from "./sqlite-ops-store.js";

const withStore = async (callback: (store: SqliteOpsStore) => void): Promise<void> => {
  const store = new SqliteOpsStore(":memory:");
  try {
    callback(store);
  } finally {
    store.close();
  }
};

test("creates an idempotent seeded schema in memory", async () => {
  await withStore((store) => {
    store.seed();
    const snapshot = store.read();
    assert.equal(snapshot.services.length, 5);
    assert.equal(snapshot.alerts.length, 6);
    assert.equal(snapshot.alerts.filter((alert) => alert.status === "firing").length, 3);
    assert.equal(snapshot.alerts.filter((alert) => alert.status === "resolved").length, 3);
    assert.equal(snapshot.runbooks.length, 3);
    assert.deepEqual(store.listAlerts("firing").map((alert) => alert.id), ["alt-001", "alt-002", "alt-003"]);
  });
});

test("persists the incident lifecycle and filters", async () => {
  await withStore((store) => {
    const incident = store.openIncident("Catalog outage", "catalog", "high");
    assert.equal(store.listIncidents().length, 1);
    assert.equal(store.listIncidents("resolved").length, 0);
    const resolved = store.resolveIncident(incident.id, "Rollback completed.");
    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.summary, "Rollback completed.");
    assert.equal(store.listIncidents("open").length, 0);
    assert.equal(store.listIncidents("resolved").length, 1);
    assert.equal(store.listIncidents("all").length, 1);
    assert.throws(() => store.resolveIncident(incident.id), /already resolved/);
  });
});

test("rejects missing services and runbooks explicitly", async () => {
  await withStore((store) => {
    assert.throws(() => store.openIncident("Missing", "unknown", "low"), /Service not found/);
    assert.equal(store.consultRunbook("auth").service, "auth");
    assert.throws(() => store.consultRunbook("unknown"), /Runbook not found/);
  });
});

test("enforces closed domain values with SQLite checks", async () => {
  await withStore((store) => {
    assert.throws(() => {
      store.db.prepare("INSERT INTO incidents (id, title, service_id, severity, status, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
        "invalid",
        "Invalid",
        "svc-api",
        "sev1",
        "open",
        new Date().toISOString(),
      );
    }, /CHECK constraint failed/);
  });
});
