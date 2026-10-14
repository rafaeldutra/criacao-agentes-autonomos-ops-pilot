import { describe, expect, it, vi } from "vitest";
import { chat200, chat202, decision409, decisionApprove200 } from "../test/fixtures";
import { createApiClient, joinUrl } from "./client";

function jsonResponse(status: number, body: unknown, requestId = "hdr-req"): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
  });
}

function clientWith(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetch = vi.fn(impl);
  return { fetch, client: createApiClient({ baseUrl: "http://api.test/", fetch: fetch as unknown as typeof globalThis.fetch }) };
}

describe("createApiClient", () => {
  it("returns final for 200 and sends the conversation id", async () => {
    const { fetch, client } = clientWith(async () => jsonResponse(200, chat200()));
    const result = await client.postChat({ message: "oi", conversationId: "c-1" });
    expect(result.ok).toBe("final");
    if (result.ok === "final") expect(result.data.answer).toContain("alertas");
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/chat");
    expect(JSON.parse(String(init?.body))).toEqual({ message: "oi", conversationId: "c-1" });
  });

  it("returns pending for 202", async () => {
    const { client } = clientWith(async () => jsonResponse(202, chat202()));
    const result = await client.postChat({ message: "resolve" });
    expect(result.ok).toBe("pending");
    if (result.ok === "pending") expect(result.data.approval.tool).toBe("resolve_incident");
  });

  it("parses decision 200 and keeps the 409 body", async () => {
    const { fetch, client } = clientWith(async (url) =>
      url.endsWith("/decision") ? jsonResponse(200, decisionApprove200()) : jsonResponse(409, decision409()),
    );
    const ok = await client.postDecision("3d2c", "approve");
    expect(ok.ok).toBe("final");
    expect(fetch.mock.calls[0]?.[0]).toBe("http://api.test/approvals/3d2c/decision");
    const conflict = await client.getApproval("3d2c");
    expect(conflict.ok).toBe(false);
    if (conflict.ok === false) {
      expect(conflict.error.code).toBe("APPROVAL_ALREADY_DECIDED");
      expect(conflict.body?.approval?.status).toBe("denied");
    }
  });

  it("maps 5xx to UiError using the header request id when the body lacks it", async () => {
    const { client } = clientWith(async () => jsonResponse(503, { error: "x", code: "MODEL_SERVICE_UNAVAILABLE" }, "hdr-503"));
    const result = await client.postChat({ message: "oi" });
    expect(result).toMatchObject({ ok: false, error: { code: "MODEL_SERVICE_UNAVAILABLE", requestId: "hdr-503" } });
  });

  it("maps 409 APPROVAL_PENDING with approvalId", async () => {
    const { client } = clientWith(async () =>
      jsonResponse(409, { requestId: "r", error: "x", code: "APPROVAL_PENDING", approvalId: "a-1" }),
    );
    const result = await client.postChat({ message: "oi" });
    expect(result).toMatchObject({ ok: false, error: { code: "APPROVAL_PENDING" }, body: { approvalId: "a-1" } });
  });

  it("maps a fetch TypeError to network", async () => {
    const { client } = clientWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await client.postChat({ message: "oi" })).toMatchObject({ ok: false, error: { code: "NETWORK" } });
  });

  it("maps an abort to aborted", async () => {
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();
    const pending = client.postChat({ message: "oi" }, { signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, error: { code: "ABORTED" } });
  });

  it("maps invalid JSON and schema mismatches to bad-response", async () => {
    const invalid = clientWith(async () => jsonResponse(200, "{not json", "hdr-bad"));
    expect(await invalid.client.postChat({ message: "oi" })).toMatchObject({
      ok: false,
      error: { code: "BAD_RESPONSE", requestId: "hdr-bad" },
    });
    const mismatch = clientWith(async () => jsonResponse(200, { requestId: "r" }));
    expect(await mismatch.client.postChat({ message: "oi" })).toMatchObject({ ok: false, error: { code: "BAD_RESPONSE" } });
  });

  it("ping reports ok, cors and unreachable", async () => {
    const ok = clientWith(async () => jsonResponse(200, {}));
    expect(await ok.client.ping()).toBe("ok");
    expect(ok.fetch.mock.calls[0]?.[0]).toBe("http://api.test/stats?since=1m");

    const cors = clientWith(async (_url, init) => {
      if (init?.mode === "no-cors") return new Response(null, { status: 200 });
      throw new TypeError("Failed to fetch");
    });
    expect(await cors.client.ping()).toBe("cors");

    const down = clientWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await down.client.ping()).toBe("unreachable");
  });

  it("joins URLs without duplicate slashes", () => {
    expect(joinUrl("http://x/", "/chat")).toBe("http://x/chat");
    expect(joinUrl("http://x//", "chat")).toBe("http://x/chat");
    expect(joinUrl("http://x/api", "/chat")).toBe("http://x/api/chat");
  });
});
