import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

/** `vite dev` and `vite preview` of the war room; used when OPSPILOT_CORS_ORIGINS is unset. */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

/** An exact origin: http(s)://host[:port], no path, query, credentials or trailing slash. */
const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === value;
  } catch {
    return false;
  }
}, "must be an origin like https://host[:port]");

export const parseCorsOrigins = (raw: string | undefined): string[] => {
  const items = (raw ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return [...DEFAULT_CORS_ORIGINS];
  for (const item of items) {
    if (item === "*") throw new Error("OPSPILOT_CORS_ORIGINS must not contain '*'; list the allowed origins");
    const parsed = originSchema.safeParse(item);
    if (!parsed.success) {
      throw new Error(`OPSPILOT_CORS_ORIGINS has an invalid origin ${JSON.stringify(item)}: ${parsed.error.issues[0]?.message}`);
    }
  }
  return [...new Set(items)];
};

export type CorsDecision = {
  /** Set only when the request ends here (preflight). */
  status?: 204 | 403;
  headers: Record<string, string>;
};

export const corsHeadersFor = (
  origin: string | undefined,
  method: string,
  allowlist: readonly string[],
): CorsDecision => {
  if (!origin) return { headers: {} };
  const preflight = method.toUpperCase() === "OPTIONS";
  if (!allowlist.includes(origin)) {
    return preflight ? { status: 403, headers: { Vary: "Origin" } } : { headers: { Vary: "Origin" } };
  }
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Expose-Headers": "X-Request-Id",
    Vary: "Origin",
  };
  if (!preflight) return { headers };
  return {
    status: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  };
};

export const corsMiddleware = (allowlist: readonly string[]) =>
  (request: Request, response: Response, next: NextFunction) => {
    const decision = corsHeadersFor(request.headers.origin, request.method, allowlist);
    for (const [name, value] of Object.entries(decision.headers)) response.setHeader(name, value);
    if (decision.status) {
      response.status(decision.status).end();
      return;
    }
    next();
  };
