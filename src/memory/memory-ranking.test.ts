import test from "node:test";
import assert from "node:assert/strict";
import {
  DEDUP_THRESHOLD,
  RECALL_MIN_SCORE,
  RECALL_TOP_K,
  dotProduct,
  findDedupMatch,
  topkByScore,
} from "./memory-ranking.js";

const unit = (index: number, dim = 4): Float32Array => {
  const v = new Float32Array(dim);
  v[index] = 1;
  return v;
};

test("dotProduct of orthonormal basis vectors is 0 or 1", () => {
  assert.equal(dotProduct(unit(0), unit(0)), 1);
  assert.equal(dotProduct(unit(0), unit(1)), 0);
});

test("topkByScore filters min score, sorts desc, caps at k", () => {
  const items = [
    { id: "a", score: 0.9 },
    { id: "b", score: 0.2 },
    { id: "c", score: 0.5 },
    { id: "d", score: 0.8 },
    { id: "e", score: 0.4 },
  ];
  const top = topkByScore(items, RECALL_TOP_K, RECALL_MIN_SCORE);
  assert.equal(top.length, 3);
  assert.deepEqual(
    top.map((t) => t.id),
    ["a", "d", "c"],
  );
  assert.ok(top.every((t) => t.score >= RECALL_MIN_SCORE));
});

test("topkByScore returns empty when all below threshold", () => {
  assert.deepEqual(topkByScore([{ id: "x", score: 0.1 }], 3, 0.3), []);
});

test("findDedupMatch returns best above threshold", () => {
  const query = unit(0);
  const match = findDedupMatch(query, [
    { id: "near", embedding: unit(0) },
    { id: "far", embedding: unit(1) },
  ], DEDUP_THRESHOLD);
  assert.equal(match?.id, "near");
  assert.ok(match && match.score > DEDUP_THRESHOLD);
});

test("findDedupMatch returns undefined below threshold", () => {
  assert.equal(
    findDedupMatch(unit(0), [{ id: "far", embedding: unit(1) }], DEDUP_THRESHOLD),
    undefined,
  );
});
