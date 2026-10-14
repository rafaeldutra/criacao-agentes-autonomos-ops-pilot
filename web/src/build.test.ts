// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { describe, expect, it } from "vitest";
import config from "../vite.config";

const webRoot = resolve(__dirname, "..");

describe("build configuration", () => {
  it("publishes under /opspilot/ when VITE_BASE is unset", () => {
    expect(config.base).toBe("/opspilot/");
  });

  it("builds under VITE_BASE and emits a 404.html identical to index.html", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "opspilot-web-build-"));
    const previous = process.env.VITE_BASE;
    process.env.VITE_BASE = "/criacao-agentes-autonomos-ops-pilot/";
    try {
      await build({
        root: webRoot,
        configFile: resolve(webRoot, "vite.config.ts"),
        logLevel: "silent",
        build: { outDir, emptyOutDir: true },
      });
      const index = readFileSync(join(outDir, "index.html"), "utf8");
      expect(readFileSync(join(outDir, "404.html"), "utf8")).toBe(index);
      expect(index).toContain('src="/criacao-agentes-autonomos-ops-pilot/assets/');
      expect(index).not.toContain("/opspilot/assets/");
    } finally {
      if (previous === undefined) delete process.env.VITE_BASE;
      else process.env.VITE_BASE = previous;
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 60_000);
});
