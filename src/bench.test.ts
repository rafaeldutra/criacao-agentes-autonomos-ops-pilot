import test from "node:test";
import assert from "node:assert/strict";
import { parseBenchArgs } from "./bench.js";

test("parses benchmark scenario and replanner flags", () => {
  assert.deepEqual(parseBenchArgs([]), { scenario: undefined, replanner: true });
  assert.deepEqual(parseBenchArgs(["--scenario", "C2", "--no-replanner"]), { scenario: "C2", replanner: false });
  assert.deepEqual(parseBenchArgs(["C1", "--no-replanner"]), { scenario: "C1", replanner: false });
  assert.throws(() => parseBenchArgs(["--scenario", "C4"]), /C1, C2, or C3/);
});
