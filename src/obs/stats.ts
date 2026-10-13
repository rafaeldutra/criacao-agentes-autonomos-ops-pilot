import type { RequestSummary } from "../store/request-store.js";

/** USD per 1M prompt tokens, keyed by configured model id. */
export type ModelPrices = Record<string, number>;

export const DEFAULT_WINDOW = "24h";
const MAX_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** "30m" | "24h" | "7d" → milliseconds; undefined when malformed, zero or above 90d. */
export const parseWindow = (value: string): number | undefined => {
  const match = /^(\d+)([mhd])$/.exec(value.trim());
  if (!match) return undefined;
  const ms = Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
  return ms > 0 && ms <= MAX_WINDOW_MS ? ms : undefined;
};

/**
 * OPSPILOT_MODEL_PRICES='{"openai/gpt-4o-mini":0.15}' (USD per 1M prompt tokens).
 * Invalid JSON or non-numeric prices fail at startup instead of silently zeroing cost.
 */
export const loadModelPrices = (env: NodeJS.ProcessEnv = process.env): ModelPrices => {
  const raw = env.OPSPILOT_MODEL_PRICES?.trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OPSPILOT_MODEL_PRICES must be a JSON object of model id → USD per 1M prompt tokens");
  }
  for (const [model, price] of Object.entries(parsed)) {
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      throw new Error(`OPSPILOT_MODEL_PRICES: invalid price for ${model}`);
    }
  }
  return parsed as ModelPrices;
};

/** OpenRouter free variants (":free" suffix or the free router) cost 0; unknown models have no price. */
export const isFreeModel = (model: string): boolean => model.endsWith(":free") || model === "openrouter/free";

const pricePerMillion = (model: string, prices: ModelPrices): number | undefined =>
  isFreeModel(model) ? 0 : prices[model];

/** Nearest-rank percentile over already sorted values. */
const percentile = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
};

export type StatsGroup = {
  total: number;
  errors: number;
  promptTokens: number;
  /** Prompt-token cost of the priced requests only; see unpricedRequests. */
  costUsd: number;
  /** Successful requests whose model has no configured price (cost not counted). */
  unpricedRequests: number;
  latencyMs: { p50: number | null; p95: number | null };
};

export type Stats = StatsGroup & {
  since: string;
  from: string;
  to: string;
  byRoute: Record<string, StatsGroup>;
  byModel: Record<string, StatsGroup>;
};

/** Error requests are stored without route/model, so they group under this key. */
export const UNKNOWN_KEY = "unknown";

const isError = (row: RequestSummary): boolean => row.status >= 400;

const round = (value: number): number => Math.round(value * 1e6) / 1e6;

const summarize = (rows: RequestSummary[], prices: ModelPrices): StatsGroup => {
  let promptTokens = 0;
  let costUsd = 0;
  let unpricedRequests = 0;
  for (const row of rows) {
    const tokens = row.promptTokens ?? 0;
    promptTokens += tokens;
    if (!row.modelUsed) continue;
    const price = pricePerMillion(row.modelUsed, prices);
    if (price === undefined) unpricedRequests += 1;
    else costUsd += (tokens / 1_000_000) * price;
  }
  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  return {
    total: rows.length,
    errors: rows.filter(isError).length,
    promptTokens,
    costUsd: round(costUsd),
    unpricedRequests,
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
  };
};

const groupBy = (
  rows: RequestSummary[],
  key: (row: RequestSummary) => string | null,
  prices: ModelPrices,
): Record<string, StatsGroup> => {
  const groups = new Map<string, RequestSummary[]>();
  for (const row of rows) {
    const name = key(row) ?? UNKNOWN_KEY;
    const group = groups.get(name);
    if (group) group.push(row);
    else groups.set(name, [row]);
  }
  return Object.fromEntries([...groups].map(([name, group]) => [name, summarize(group, prices)]));
};

export const computeStats = (
  rows: RequestSummary[],
  window: { since: string; from: string; to: string },
  prices: ModelPrices,
): Stats => ({
  ...window,
  ...summarize(rows, prices),
  byRoute: groupBy(rows, (row) => row.route, prices),
  byModel: groupBy(rows, (row) => row.modelUsed, prices),
});
