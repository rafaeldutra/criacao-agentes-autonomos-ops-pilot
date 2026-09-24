import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const getUserId = (): string | undefined => storage.getStore()?.userId;

export const runWithUserId = async <T>(userId: string | undefined, fn: () => T | Promise<T>): Promise<T> =>
  storage.run({ userId }, fn);
