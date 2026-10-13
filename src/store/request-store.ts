import type { ContextBreakdown, Metrics, StrategyRoute, TraceEvent } from "../agents/types.js";
import { DomainError } from "./ops-store.js";

export type RequestMetrics = Pick<
  Metrics,
  "llmCalls" | "promptTokens" | "modelUsed" | "historyMessages" | "memoryFacts" | "contextBreakdown"
>;

/** One /chat execution, as written after the response finished. */
export type RequestRecordInput = {
  requestId: string;
  createdAt: string;
  conversationId?: string;
  userId?: string;
  route?: StrategyRoute;
  reflect?: boolean;
  status: number;
  errorCode?: string;
  latencyMs: number;
  metrics?: RequestMetrics;
  trace: TraceEvent[];
};

export type RequestDetail = {
  requestId: string;
  createdAt: string;
  conversationId: string | null;
  userId: string | null;
  route: StrategyRoute | null;
  reflect: boolean | null;
  status: number;
  errorCode: string | null;
  latencyMs: number;
  metrics: {
    llmCalls: number | null;
    promptTokens: number | null;
    modelUsed: string | null;
    historyMessages: number | null;
    memoryFacts: number | null;
    /** Estimated (chars/4), unlike the real promptTokens. */
    contextBreakdown: ContextBreakdown | null;
  } | null;
  trace: TraceEvent[];
};

/** The columns /stats aggregates; no trace. */
export type RequestSummary = {
  createdAt: string;
  route: StrategyRoute | null;
  status: number;
  latencyMs: number;
  promptTokens: number | null;
  modelUsed: string | null;
};

export interface RequestStore {
  /** Atomic: the request row and all trace events, or nothing. Throws on error. */
  record(input: RequestRecordInput): void;
  get(requestId: string): RequestDetail | undefined;
  /** Requests with createdAt >= sinceIso (ISO 8601 UTC, compared as text), oldest first. */
  listSince(sinceIso: string): RequestSummary[];
  close(): void;
}

export const REQUEST_NOT_FOUND = "REQUEST_NOT_FOUND";

export const getRequestOrThrow = (store: RequestStore, requestId: string): RequestDetail => {
  const detail = store.get(requestId);
  if (!detail) throw new DomainError(`Request not found: ${requestId}`, REQUEST_NOT_FOUND);
  return detail;
};

export { DomainError };

/** Shared write validation so the fake mirrors the SQLite constraints. */
export const assertRecordable = (input: RequestRecordInput): void => {
  if (!input.requestId) throw new Error("requestId must not be empty");
  if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) {
    throw new Error(`Invalid HTTP status: ${input.status}`);
  }
  if (!Number.isInteger(input.latencyMs) || input.latencyMs < 0) {
    throw new Error("latencyMs must be a non-negative integer");
  }
  input.trace.forEach((event, seq) => {
    if (typeof event?.type !== "string" || !event.type) {
      throw new Error(`Trace event ${seq} has no type`);
    }
  });
};

const hasMetrics = (metrics: RequestMetrics | undefined): metrics is RequestMetrics =>
  metrics !== undefined && Object.values(metrics).some((value) => value !== undefined);

/** Normalizes a written record the way SQLite reads it back (absent → null). */
export const toRequestDetail = (input: RequestRecordInput): RequestDetail => ({
  requestId: input.requestId,
  createdAt: input.createdAt,
  conversationId: input.conversationId ?? null,
  userId: input.userId ?? null,
  route: input.route ?? null,
  reflect: input.reflect ?? null,
  status: input.status,
  errorCode: input.errorCode ?? null,
  latencyMs: input.latencyMs,
  metrics: hasMetrics(input.metrics)
    ? {
        llmCalls: input.metrics.llmCalls ?? null,
        promptTokens: input.metrics.promptTokens ?? null,
        modelUsed: input.metrics.modelUsed ?? null,
        historyMessages: input.metrics.historyMessages ?? null,
        memoryFacts: input.metrics.memoryFacts ?? null,
        contextBreakdown: input.metrics.contextBreakdown ?? null,
      }
    : null,
  trace: input.trace,
});
