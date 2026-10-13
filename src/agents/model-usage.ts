import { AsyncLocalStorage } from "node:async_hooks";

export type FallbackRecord = {
  fromModel: string;
  toModel: string;
  reason: string;
};

type ModelUsageScope = {
  modelUsed?: string;
  fallbacks: FallbackRecord[];
};

const storage = new AsyncLocalStorage<ModelUsageScope>();

/** Opens a fresh per-turn scope; model calls inside it record usage and fallbacks. */
export const runWithModelUsage = async <T>(
  fn: () => T | Promise<T>,
): Promise<{ result: T; modelUsed?: string }> => {
  const scope: ModelUsageScope = { fallbacks: [] };
  const result = await storage.run(scope, fn);
  return scope.modelUsed === undefined ? { result } : { result, modelUsed: scope.modelUsed };
};

export const recordModelUsed = (model: string): void => {
  const scope = storage.getStore();
  if (scope) scope.modelUsed = model;
};

export const recordFallback = (record: FallbackRecord): void => {
  storage.getStore()?.fallbacks.push(record);
};

/** Returns the fallbacks recorded since the last drain and clears them. */
export const drainFallbacks = (): FallbackRecord[] => {
  const scope = storage.getStore();
  if (!scope) return [];
  return scope.fallbacks.splice(0, scope.fallbacks.length);
};
