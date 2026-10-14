import { describe, expect, it } from "vitest";
import { toUiError } from "./errors";

describe("toUiError", () => {
  const cases: Array<[string, number, Record<string, unknown>, string, string]> = [
    ["400 validation", 400, { code: "VALIDATION_ERROR" }, "VALIDATION_ERROR", "retry"],
    ["400 invalid json", 400, { code: "INVALID_JSON" }, "INVALID_JSON", "retry"],
    ["404 conversation", 404, { code: "CONVERSATION_NOT_FOUND" }, "CONVERSATION_NOT_FOUND", "new-conversation"],
    ["409 pending", 409, { code: "APPROVAL_PENDING", approvalId: "a" }, "APPROVAL_PENDING", "decide-approval"],
    ["422 strategy", 422, { code: "UNKNOWN_STRATEGY" }, "UNKNOWN_STRATEGY", "retry"],
    ["502 router", 502, { code: "ROUTER_FAILED" }, "ROUTER_FAILED", "retry"],
    ["502 provider", 502, { code: "PROVIDER_ERROR" }, "PROVIDER_ERROR", "retry"],
    ["503 models", 503, { code: "MODEL_SERVICE_UNAVAILABLE" }, "MODEL_SERVICE_UNAVAILABLE", "retry"],
    ["504 timeout", 504, { code: "CHAT_TIMEOUT" }, "CHAT_TIMEOUT", "retry"],
    ["500 internal", 500, { code: "INTERNAL_ERROR" }, "INTERNAL_ERROR", "retry"],
  ];

  it.each(cases)("%s", (_name, status, body, code, action) => {
    const error = toUiError({ kind: "http", status, body: { ...body, error: "raw backend text", requestId: "req-1" } });
    expect(error.code).toBe(code);
    expect(error.action).toBe(action);
    expect(error.requestId).toBe("req-1");
    expect(error.status).toBe(status);
    expect(error.title).not.toContain("raw backend text");
    expect(error.description).not.toContain("raw backend text");
  });

  it("uses the 504 title from the contract", () => {
    expect(toUiError({ kind: "http", status: 504, body: {} }).title).toBe("O agente demorou demais");
  });

  it("falls back to the header request id and a default code when the body lacks them", () => {
    const error = toUiError({ kind: "http", status: 503, body: "not json", requestId: "hdr-9" });
    expect(error.code).toBe("MODEL_SERVICE_UNAVAILABLE");
    expect(error.requestId).toBe("hdr-9");
  });

  it("prefers the body request id over the header", () => {
    expect(toUiError({ kind: "http", status: 500, body: { requestId: "body" }, requestId: "hdr" }).requestId).toBe(
      "body",
    );
  });

  it("maps network, aborted and bad-response", () => {
    const network = toUiError({ kind: "network" });
    expect(network).toMatchObject({ code: "NETWORK", action: "open-settings", title: "Não foi possível falar com a API" });
    expect(toUiError({ kind: "aborted" })).toMatchObject({ code: "ABORTED", action: "retry", title: "Espera cancelada" });
    expect(toUiError({ kind: "bad-response", requestId: "r" })).toMatchObject({
      code: "BAD_RESPONSE",
      action: "retry",
      requestId: "r",
    });
  });
});
