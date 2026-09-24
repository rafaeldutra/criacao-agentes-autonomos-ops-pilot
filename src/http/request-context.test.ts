import test from "node:test";
import assert from "node:assert/strict";
import { getUserId, runWithUserId } from "./request-context.js";

test("runWithUserId exposes getUserId inside the callback", async () => {
  assert.equal(getUserId(), undefined);
  await runWithUserId("ops-1", async () => {
    assert.equal(getUserId(), "ops-1");
  });
  assert.equal(getUserId(), undefined);
});

test("runWithUserId with undefined clears identity", async () => {
  await runWithUserId(undefined, async () => {
    assert.equal(getUserId(), undefined);
  });
});
