import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { StrategyRoute, TraceEvent } from "../agents/types.js";
import { errorMeta, traceEventMeta, type LogFields, type Logger } from "../obs/logger.js";
import { computeStats, DEFAULT_WINDOW, parseWindow, type ModelPrices } from "../obs/stats.js";
import {
  DomainError,
  getRequestOrThrow,
  REQUEST_NOT_FOUND,
  type RequestMetrics,
  type RequestRecordInput,
  type RequestStore,
} from "../store/request-store.js";

/** What the /chat edge knows about the outcome; filled in response.locals.chatOutcome. */
export type ChatOutcome = {
  conversationId?: string;
  userId?: string;
  reflect?: boolean;
  route?: StrategyRoute;
  metrics?: RequestMetrics;
  trace?: TraceEvent[];
  errorCode?: string;
  /** Set when the turn ended waiting for a human decision (HTTP 202). */
  approvalId?: string;
};

type TraceLocals = {
  requestId: string;
  startedAt: string;
  startedAtMs: number;
  latencyMs?: number;
  chatOutcome?: ChatOutcome;
};

const locals = (response: Response): TraceLocals => response.locals as TraceLocals;

export const getRequestId = (response: Response): string => locals(response).requestId;

/** Present only on /chat requests (set by chatAuditMiddleware). */
export const getChatOutcome = (response: Response): ChatOutcome | undefined => locals(response).chatOutcome;

export const setChatOutcome = (response: Response, outcome: ChatOutcome): void => {
  const current = locals(response).chatOutcome;
  if (current) Object.assign(current, outcome);
};

export const withRequestId = <T extends object>(requestId: string, body: T): { requestId: string } & T => ({
  requestId,
  ...body,
});

/** Single latency measurement per request, shared by the persisted record and request.end. */
const finishLatency = (response: Response): number => {
  const state = locals(response);
  state.latencyMs ??= Math.max(0, Math.round(performance.now() - state.startedAtMs));
  return state.latencyMs;
};

const pathOf = (request: Request): string => request.originalUrl.split("?")[0] ?? request.originalUrl;

export const toRequestRecord = (
  requestId: string,
  startedAt: string,
  latencyMs: number,
  status: number,
  outcome: ChatOutcome = {},
): RequestRecordInput => {
  // 202 = turn finished waiting for approval: its partial trace and metrics are kept too.
  const ok = status === 200 || status === 202;
  return {
    requestId,
    createdAt: startedAt,
    conversationId: outcome.conversationId,
    userId: outcome.userId,
    route: ok ? outcome.route : undefined,
    reflect: outcome.reflect,
    status,
    errorCode: ok ? undefined : outcome.errorCode,
    latencyMs: Math.max(0, Math.round(latencyMs)),
    metrics: ok && outcome.metrics
      ? {
          llmCalls: outcome.metrics.llmCalls,
          promptTokens: outcome.metrics.promptTokens,
          modelUsed: outcome.metrics.modelUsed,
          historyMessages: outcome.metrics.historyMessages,
          memoryFacts: outcome.metrics.memoryFacts,
          contextBreakdown: outcome.metrics.contextBreakdown,
        }
      : undefined,
    trace: ok ? (outcome.trace ?? []) : [],
  };
};

export const chatEndFields = (outcome: ChatOutcome | undefined, status: number): LogFields =>
  outcome
    ? {
        errorCode: outcome.errorCode,
        route: outcome.route,
        llmCalls: outcome.metrics?.llmCalls,
        promptTokens: outcome.metrics?.promptTokens,
        modelUsed: outcome.metrics?.modelUsed,
        traceEvents: status === 200 || status === 202 ? (outcome.trace?.length ?? 0) : 0,
        ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
      }
    : {};

const endLevel = (status: number): "info" | "warn" | "error" =>
  status >= 500 ? "error" : status >= 400 ? "warn" : "info";

/** Generates the server-side id, sets X-Request-Id and logs request.start/request.end. */
export const requestIdMiddleware = (logger: Logger) => (request: Request, response: Response, next: NextFunction) => {
  const requestId = randomUUID();
  const state = locals(response);
  state.requestId = requestId;
  state.startedAt = new Date().toISOString();
  state.startedAtMs = performance.now();
  response.setHeader("X-Request-Id", requestId);

  const method = request.method;
  const path = pathOf(request);
  logger.info("request.start", { requestId, method, path });
  response.once("finish", () => {
    const status = response.statusCode;
    logger[endLevel(status)]("request.end", {
      requestId,
      method,
      path,
      status,
      latencyMs: finishLatency(response),
      ...chatEndFields(getChatOutcome(response), status),
    });
  });
  next();
};

/** Persists the /chat request and its trace after the response is sent; never affects it. */
export const chatAuditMiddleware = (store: RequestStore, logger: Logger) =>
  (_request: Request, response: Response, next: NextFunction) => {
    const state = locals(response);
    state.chatOutcome = {};
    // Prepended so trace.event lines precede the request.end line.
    response.prependOnceListener("finish", () => {
      const { requestId } = state;
      const record = toRequestRecord(
        requestId,
        state.startedAt,
        finishLatency(response),
        response.statusCode,
        state.chatOutcome,
      );
      record.trace.forEach((event, seq) => {
        logger.info("trace.event", { requestId, ...traceEventMeta(event, seq) });
      });
      try {
        store.record(record);
      } catch (error) {
        logger.error("request.persist_failed", { requestId, ...errorMeta(error) });
      }
    });
    next();
  };

/** GET /stats?since=24h — aggregates over persisted /chat requests in the window. */
export const getStatsHandler = (store: RequestStore, prices: ModelPrices, now: () => Date = () => new Date()) =>
  (request: Request, response: Response, next: NextFunction) => {
    const since = typeof request.query.since === "string" ? request.query.since : DEFAULT_WINDOW;
    const windowMs = parseWindow(since);
    if (windowMs === undefined) {
      response.status(400).json({
        error: `Invalid since: ${since} (expected <n>m, <n>h or <n>d, up to 90d)`,
        code: "INVALID_WINDOW",
      });
      return;
    }
    try {
      const to = now();
      const from = new Date(to.getTime() - windowMs);
      const rows = store.listSince(from.toISOString());
      response
        .status(200)
        .json(computeStats(rows, { since, from: from.toISOString(), to: to.toISOString() }, prices));
    } catch (error) {
      next(error);
    }
  };

const requestIdParam = z.uuid();

/** GET /requests/:id — the query's own id travels only in the X-Request-Id header. */
export const getRequestHandler = (store: RequestStore) => (request: Request, response: Response, next: NextFunction) => {
  const parsed = requestIdParam.safeParse(request.params.id);
  if (!parsed.success) {
    response.status(400).json({ issues: parsed.error.issues });
    return;
  }
  try {
    response.status(200).json(getRequestOrThrow(store, parsed.data));
  } catch (error) {
    if (error instanceof DomainError && error.code === REQUEST_NOT_FOUND) {
      response.status(404).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
};
