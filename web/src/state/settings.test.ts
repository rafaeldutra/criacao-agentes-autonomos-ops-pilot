import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_API_URL, loadSettings, parseApiUrl, saveSettings, STORAGE_KEYS } from "./settings";

describe("parseApiUrl", () => {
  it("accepts http(s) URLs and strips the trailing slash", () => {
    expect(parseApiUrl("http://localhost:3000/")).toEqual({ ok: true, url: "http://localhost:3000" });
    expect(parseApiUrl("https://api.x.com")).toEqual({ ok: true, url: "https://api.x.com" });
    expect(parseApiUrl("  https://api.x.com/base/  ")).toEqual({ ok: true, url: "https://api.x.com/base" });
  });

  it.each(["ftp://x", "javascript:alert(1)", "http://user:pw@x", "", "   ", "localhost:3000x y"])(
    "rejects %j",
    (input) => {
      const result = parseApiUrl(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    },
  );
});

describe("load/save settings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults when nothing is stored", () => {
    expect(loadSettings()).toEqual({ apiUrl: DEFAULT_API_URL, theme: "system", persisted: true });
  });

  it("round-trips URL and theme", () => {
    expect(saveSettings({ apiUrl: "https://api.x.com", theme: "dark" })).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.apiUrl)).toBe("https://api.x.com");
    expect(loadSettings()).toEqual({ apiUrl: "https://api.x.com", theme: "dark", persisted: true });
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem(STORAGE_KEYS.apiUrl, "ftp://x");
    localStorage.setItem(STORAGE_KEYS.theme, "neon");
    expect(loadSettings()).toEqual({ apiUrl: DEFAULT_API_URL, theme: "system", persisted: true });
  });

  it("falls back to defaults with persisted: false when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(loadSettings()).toEqual({ apiUrl: DEFAULT_API_URL, theme: "system", persisted: false });
    expect(saveSettings({ apiUrl: "https://api.x.com", theme: "light" })).toBe(false);
  });
});
