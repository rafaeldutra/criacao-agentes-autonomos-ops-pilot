import { vi, type Mock } from "vitest";
import type { ApiClient, ApiFailure, ApiResult, PingOutcome } from "../api/client";
import { toUiError } from "../api/errors";
import {
  apiErrorSchema,
  approvalSchema,
  chatOkSchema,
  chatPendingSchema,
  decisionOkSchema,
  decisionPendingSchema,
  type Approval,
  type ChatOk,
  type ChatPending,
  type DecisionOk,
  type DecisionPending,
} from "../api/schemas";

export interface FakeClient extends ApiClient {
  postChat: Mock<ApiClient["postChat"]>;
  postDecision: Mock<ApiClient["postDecision"]>;
  getApproval: Mock<ApiClient["getApproval"]>;
  ping: Mock<() => Promise<PingOutcome>>;
}

export function createFakeClient(baseUrl = "http://api.test"): FakeClient {
  return {
    baseUrl,
    postChat: vi.fn<ApiClient["postChat"]>(),
    postDecision: vi.fn<ApiClient["postDecision"]>(),
    getApproval: vi.fn<ApiClient["getApproval"]>(),
    ping: vi.fn<() => Promise<PingOutcome>>(async () => "ok"),
  };
}

export const chatFinal = (body: unknown): ApiResult<ChatOk, ChatPending> => {
  const data = chatOkSchema.parse(body);
  return { ok: "final", data, requestId: data.requestId };
};

export const chatPending = (body: unknown): ApiResult<ChatOk, ChatPending> => {
  const data = chatPendingSchema.parse(body);
  return { ok: "pending", data, requestId: data.requestId };
};

export const decisionFinal = (body: unknown): ApiResult<DecisionOk, DecisionPending> => {
  const data = decisionOkSchema.parse(body);
  return { ok: "final", data, requestId: data.requestId };
};

export const decisionPending = (body: unknown): ApiResult<DecisionOk, DecisionPending> => {
  const data = decisionPendingSchema.parse(body);
  return { ok: "pending", data, requestId: data.requestId };
};

export const approvalFinal = (body: unknown): ApiResult<Approval> => ({ ok: "final", data: approvalSchema.parse(body) });

export function httpFailure(status: number, body: unknown, requestId?: string): ApiFailure {
  const parsed = apiErrorSchema.safeParse(body);
  return {
    ok: false,
    error: toUiError({ kind: "http", status, body, requestId }),
    ...(parsed.success ? { body: parsed.data } : {}),
  };
}

export const networkFailure = (): ApiFailure => ({ ok: false, error: toUiError({ kind: "network" }) });

/** A postChat implementation that never settles until the signal aborts. */
export function hangingChat(): ApiClient["postChat"] {
  return (_body, options) =>
    new Promise((resolve) => {
      options?.signal?.addEventListener("abort", () =>
        resolve({ ok: false, error: toUiError({ kind: "aborted" }) }),
      );
    });
}
