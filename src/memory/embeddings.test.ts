import test from "node:test";
import assert from "node:assert/strict";
import { embed, getEmbedPipelinePromise } from "./embeddings.js";

test("embed singleton reuses pipeline and returns unit-ish vectors", { timeout: 180_000 }, async () => {
  const a = await embed("hello world");
  const firstPipeline = getEmbedPipelinePromise();
  const b = await embed("hello world");
  const secondPipeline = getEmbedPipelinePromise();

  assert.equal(firstPipeline, secondPipeline);
  assert.equal(a.length, 384);
  assert.equal(b.length, 384);

  let norm = 0;
  for (let i = 0; i < a.length; i += 1) norm += a[i]! * a[i]!;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 0.05, `expected L2≈1, got ${Math.sqrt(norm)}`);
});
