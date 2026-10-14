import type { z } from "zod";
import { toUiError, type UiError } from "./errors";
import {
  apiErrorSchema,
  approvalSchema,
  chatOkSchema,
  chatPendingSchema,
  decisionOkSchema,
  decisionPendingSchema,
  type ApiErrorBody,
  type Approval,
  type ChatOk,
  type ChatPending,
  type DecisionOk,
  type DecisionPending,
} from "./schemas";

export const CLIENT_TIMEOUT_MS = 190_000;
export const PING_TIMEOUT_MS = 5_000;

export type ApiFailure = { ok: false; error: UiError; body?: ApiErrorBody };

export type ApiResult<Final, Pending = never> =
  | { ok: "final"; data: Final; requestId?: string }
  | { ok: "pending"; data: Pending; requestId?: string }
  | ApiFailure;

export type PingOutcome = "ok" | "unreachable" | "cors";

export interface ChatRequest {
  message: string;
  conversationId?: string;
}

export interface CallOptions {
  signal?: AbortSignal;
}

export interface ApiClient {
  readonly baseUrl: string;
  postChat(body: ChatRequest, options?: CallOptions): Promise<ApiResult<ChatOk, ChatPending>>;
  postDecision(
    id: string,
    decision: "approve" | "deny",
    options?: CallOptions,
  ): Promise<ApiResult<DecisionOk, DecisionPending>>;
  getApproval(id: string, options?: CallOptions): Promise<ApiResult<Approval>>;
  ping(): Promise<PingOutcome>;
}

export interface ApiClientOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

/** Joins the base URL and a path without duplicate slashes. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

interface TimedSignal {
  signal: AbortSignal;
  timedOut: () => boolean;
  dispose: () => void;
}

/** Combines the caller signal with a client-side timeout (cleared when the call settles). */
function timedSignal(outer: AbortSignal | undefined, ms: number): TimedSignal {
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  else outer?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

type RawResponse =
  | { kind: "response"; status: number; body: unknown; requestId?: string; jsonOk: boolean }
  | { kind: "failure"; failure: ApiFailure };

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? CLIENT_TIMEOUT_MS;
  const baseUrl = options.baseUrl;

  async function request(path: string, init: RequestInit, signal?: AbortSignal): Promise<RawResponse> {
    const timed = timedSignal(signal, timeoutMs);
    try {
      const response = await doFetch(joinUrl(baseUrl, path), { ...init, signal: timed.signal });
      const requestId = response.headers.get("X-Request-Id") ?? undefined;
      const text = await response.text();
      let body: unknown = undefined;
      let jsonOk = true;
      try {
        body = text.length > 0 ? JSON.parse(text) : undefined;
      } catch {
        jsonOk = false;
      }
      return { kind: "response", status: response.status, body, requestId, jsonOk };
    } catch (error) {
      if (timed.timedOut()) {
        return {
          kind: "failure",
          failure: { ok: false, error: toUiError({ kind: "http", status: 504, body: { code: "CHAT_TIMEOUT" } }) },
        };
      }
      if (isAbortError(error) || signal?.aborted) {
        return { kind: "failure", failure: { ok: false, error: toUiError({ kind: "aborted" }) } };
      }
      return { kind: "failure", failure: { ok: false, error: toUiError({ kind: "network" }) } };
    } finally {
      timed.dispose();
    }
  }

  function failureFrom(raw: Extract<RawResponse, { kind: "response" }>): ApiFailure {
    const parsed = apiErrorSchema.safeParse(raw.body);
    const body = parsed.success ? parsed.data : undefined;
    return {
      ok: false,
      error: toUiError({ kind: "http", status: raw.status, body: raw.body, requestId: raw.requestId }),
      ...(body ? { body } : {}),
    };
  }

  function badResponse(requestId: string | undefined, body: unknown): ApiFailure {
    const fromBody = apiErrorSchema.safeParse(body);
    const id = requestId ?? (fromBody.success ? fromBody.data.requestId : undefined);
    return { ok: false, error: toUiError({ kind: "bad-response", requestId: id }) };
  }

  async function call<F, P>(
    path: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
    finalSchema: z.ZodType<F>,
    pendingSchema?: z.ZodType<P>,
  ): Promise<ApiResult<F, P>> {
    const raw = await request(path, init, signal);
    if (raw.kind === "failure") return raw.failure;
    if (!raw.jsonOk) return badResponse(raw.requestId, undefined);
    if (raw.status === 200) {
      const parsed = finalSchema.safeParse(raw.body);
      if (!parsed.success) return badResponse(raw.requestId, raw.body);
      return { ok: "final", data: parsed.data, requestId: raw.requestId };
    }
    if (raw.status === 202 && pendingSchema) {
      const parsed = pendingSchema.safeParse(raw.body);
      if (!parsed.success) return badResponse(raw.requestId, raw.body);
      return { ok: "pending", data: parsed.data, requestId: raw.requestId };
    }
    if (raw.status >= 400) return failureFrom(raw);
    return badResponse(raw.requestId, raw.body);
  }

  const jsonPost = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  return {
    baseUrl,
    postChat(body, callOptions) {
      const payload: ChatRequest = { message: body.message };
      if (body.conversationId) payload.conversationId = body.conversationId;
      return call("/chat", jsonPost(payload), callOptions?.signal, chatOkSchema, chatPendingSchema);
    },
    postDecision(id, decision, callOptions) {
      return call(
        `/approvals/${encodeURIComponent(id)}/decision`,
        jsonPost({ decision }),
        callOptions?.signal,
        decisionOkSchema,
        decisionPendingSchema,
      );
    },
    getApproval(id, callOptions) {
      return call(
        `/approvals/${encodeURIComponent(id)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        callOptions?.signal,
        approvalSchema,
      );
    },
    async ping() {
      const url = joinUrl(baseUrl, "/stats?since=1m");
      const corsTimer = timedSignal(undefined, PING_TIMEOUT_MS);
      try {
        const response = await doFetch(url, { method: "GET", signal: corsTimer.signal });
        return response.ok ? "ok" : "unreachable";
      } catch {
        if (corsTimer.timedOut()) return "unreachable";
      } finally {
        corsTimer.dispose();
      }
      // A CORS refusal looks like a network error; an opaque (no-cors) request tells them apart.
      const opaqueTimer = timedSignal(undefined, PING_TIMEOUT_MS);
      try {
        await doFetch(url, { method: "GET", mode: "no-cors", signal: opaqueTimer.signal });
        return "cors";
      } catch {
        return "unreachable";
      } finally {
        opaqueTimer.dispose();
      }
    },
  };
}
