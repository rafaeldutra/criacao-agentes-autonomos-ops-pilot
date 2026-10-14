// @vitest-environment node
import { describe, expect, it } from "vitest";
import config from "../vite.config";

describe("build configuration", () => {
  it("publishes under /opspilot/", () => {
    expect(config.base).toBe("/opspilot/");
  });
});
