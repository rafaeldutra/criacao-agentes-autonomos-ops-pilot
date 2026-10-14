import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expiryCutoff,
  isExpired,
  loadApprovalTtlMinutes,
  toApprovalView,
  type ApprovalInput,
  type ApprovalStore,
} from "./approval-store.js";
import { FakeApprovalStore } from "./fake-approval-store.js";
import { SqliteApprovalStore } from "./sqlite-approval-store.js";

const input = (overrides: Partial<ApprovalInput> = {}): ApprovalInput => ({
  id: "a-1",
  conversationId: "c-1",
  requestId: "r-1",
  userId: "u-1",
  tool: "resolve_incident",
  args: { id: "inc-1", summary: "ok" },
  reason: "metrics stable",
  originalMessage: "resolve the checkout incident",
  createdAt: "2026-10-14T12:00:00.000Z",
  ...overrides,
});

const implementations: Array<[string, () => ApprovalStore]> = [
  ["SqliteApprovalStore(:memory:)", () => new SqliteApprovalStore(":memory:")],
  ["FakeApprovalStore", () => new FakeApprovalStore()],
];

for (const [name, make] of implementations) {
  test(`${name}: create returns a pending approval and get reads it back`, () => {
    const store = make();
    const created = store.create(input());
    assert.equal(created.status, "pending");
    assert.equal(created.decidedAt, null);
    assert.equal(created.result, null);
    assert.deepEqual(created.args, { id: "inc-1", summary: "ok" });
    assert.deepEqual(store.get("a-1"), created);
    assert.equal(store.get("missing"), undefined);
    store.close();
  });

  test(`${name}: claim wins exactly once`, () => {
    const store = make();
    store.create(input());
    assert.equal(store.claim("a-1", "approved", "2026-10-14T12:01:00.000Z"), true);
    assert.equal(store.claim("a-1", "denied", "2026-10-14T12:02:00.000Z"), false);
    const row = store.get("a-1");
    assert.equal(row?.status, "approved");
    assert.equal(row?.decidedAt, "2026-10-14T12:01:00.000Z");
    assert.equal(store.claim("missing", "approved", "2026-10-14T12:01:00.000Z"), false);
    store.close();
  });

  test(`${name}: complete records result and resume request after a claim`, () => {
    const store = make();
    store.create(input());
    store.complete("a-1", { status: "failed", result: "ignored", resumeRequestId: "r-2" });
    assert.equal(store.get("a-1")?.status, "pending", "complete never touches a pending row");
    store.claim("a-1", "approved", "2026-10-14T12:01:00.000Z");
    store.complete("a-1", { status: "failed", result: "boom", resumeRequestId: "r-2" });
    const row = store.get("a-1");
    assert.equal(row?.status, "failed");
    assert.equal(row?.result, "boom");
    assert.equal(row?.resumeRequestId, "r-2");
    store.close();
  });

  test(`${name}: findPending ignores decided, other conversations and rows older than the cutoff`, () => {
    const store = make();
    store.create(input({ id: "old", createdAt: "2026-10-13T00:00:00.000Z" }));
    store.create(input({ id: "other", conversationId: "c-2" }));
    store.create(input({ id: "decided", createdAt: "2026-10-14T12:05:00.000Z" }));
    store.claim("decided", "denied", "2026-10-14T12:06:00.000Z");
    assert.equal(store.findPending("c-1", "2026-10-14T00:00:00.000Z"), undefined);
    store.create(input({ id: "fresh", createdAt: "2026-10-14T12:10:00.000Z" }));
    assert.equal(store.findPending("c-1", "2026-10-14T00:00:00.000Z")?.id, "fresh");
    assert.equal(store.findPending("c-1", "2026-10-12T00:00:00.000Z")?.id, "fresh", "newest first");
    store.close();
  });

  test(`${name}: rejects non-sensitive tools and empty reasons`, () => {
    const store = make();
    assert.throws(() => store.create(input({ tool: "open_incident" as never })));
    assert.throws(() => store.create(input({ reason: "  " })));
    store.close();
  });
}

test("SqliteApprovalStore: schema is idempotent across reopen of the same file", () => {
  const dir = mkdtempSync(join(tmpdir(), "opspilot-approvals-"));
  const path = join(dir, "test.db");
  try {
    const first = new SqliteApprovalStore(path);
    first.create(input());
    first.close();
    const second = new SqliteApprovalStore(path);
    assert.equal(second.get("a-1")?.status, "pending");
    second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isExpired/toApprovalView derive expired only for pending rows past the TTL", () => {
  const store = new FakeApprovalStore();
  const approval = store.create(input());
  const later = new Date("2026-10-15T12:00:00.001Z");
  assert.equal(expiryCutoff(later, 1440), "2026-10-14T12:00:00.001Z");
  assert.equal(isExpired(approval, later, 1440), true);
  assert.equal(isExpired(approval, new Date("2026-10-15T11:59:59.000Z"), 1440), false);
  const view = toApprovalView(approval, later, 1440);
  assert.equal(view.status, "expired");
  assert.equal("userId" in view, false);
  assert.equal("originalMessage" in view, false);
  assert.equal(isExpired({ ...approval, status: "approved" }, later, 1440), false);
});

test("loadApprovalTtlMinutes defaults to 1440 and rejects non-positive values", () => {
  assert.equal(loadApprovalTtlMinutes({}), 1440);
  assert.equal(loadApprovalTtlMinutes({ OPSPILOT_APPROVAL_TTL_MINUTES: "30" }), 30);
  assert.throws(() => loadApprovalTtlMinutes({ OPSPILOT_APPROVAL_TTL_MINUTES: "0" }));
  assert.throws(() => loadApprovalTtlMinutes({ OPSPILOT_APPROVAL_TTL_MINUTES: "abc" }));
});
