// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_BASE, resolveBase } from "../build-config";

describe("resolveBase", () => {
  it.each([undefined, "", "  "])("falls back to /opspilot/ for %j", (raw) => {
    expect(resolveBase(raw)).toBe(DEFAULT_BASE);
    expect(DEFAULT_BASE).toBe("/opspilot/");
  });

  it.each([
    ["/criacao-agentes-autonomos-ops-pilot/", "/criacao-agentes-autonomos-ops-pilot/"],
    ["criacao-agentes-autonomos-ops-pilot", "/criacao-agentes-autonomos-ops-pilot/"],
    ["/a/b", "/a/b/"],
    ["  /x/  ", "/x/"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(resolveBase(raw)).toBe(expected);
  });

  it.each(["../x", "/a/../b/", "//evil", "https://x/", "/a b/"])("rejects %j", (raw) => {
    expect(() => resolveBase(raw)).toThrow(/VITE_BASE/);
  });
});
