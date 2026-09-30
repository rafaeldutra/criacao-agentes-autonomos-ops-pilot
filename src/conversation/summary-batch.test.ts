import test from "node:test";
import assert from "node:assert/strict";
import { selectSummaryBatch } from "./summary-batch.js";

test("selectSummaryBatch returns undefined when total <= window", () => {
  assert.equal(selectSummaryBatch({ totalMessages: 8, coveredCount: 0 }), undefined);
  assert.equal(selectSummaryBatch({ totalMessages: 0, coveredCount: 0 }), undefined);
});

test("selectSummaryBatch returns undefined when fewer than 8 uncovered outside window", () => {
  assert.equal(selectSummaryBatch({ totalMessages: 15, coveredCount: 0 }), undefined);
  assert.equal(selectSummaryBatch({ totalMessages: 16, coveredCount: 1 }), undefined);
});

test("selectSummaryBatch selects first batch at total=16 covered=0", () => {
  assert.deepEqual(selectSummaryBatch({ totalMessages: 16, coveredCount: 0 }), {
    offset: 0,
    limit: 8,
  });
});

test("selectSummaryBatch selects second batch at covered=8 total=24", () => {
  assert.deepEqual(selectSummaryBatch({ totalMessages: 24, coveredCount: 8 }), {
    offset: 8,
    limit: 8,
  });
});
