import test from "node:test";
import assert from "node:assert/strict";
import { formatMemoryBlock } from "./memory-prompt.js";

test("formatMemoryBlock returns empty string for no facts", () => {
  assert.equal(formatMemoryBlock([]), "");
});

test("formatMemoryBlock lists facts under Relevant memories", () => {
  const block = formatMemoryBlock([
    { id: "1", fact: "prefers coffee", score: 0.9 },
    { id: "2", fact: "works nights", score: 0.5 },
  ]);
  assert.match(block, /^\[Relevant memories\]\n/);
  assert.match(block, /- prefers coffee/);
  assert.match(block, /- works nights/);
  assert.ok(block.endsWith("\n\n"));
});
