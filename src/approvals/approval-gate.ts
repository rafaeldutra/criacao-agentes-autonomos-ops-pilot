import { AsyncLocalStorage } from "node:async_hooks";
import type { SensitiveTool } from "../store/approval-store.js";

export type ToolCall = { tool: string; args: Record<string, unknown> };

/** A decision already taken for an exact (tool, args) call; valid only in the resumed turn. */
export type Grant = ToolCall & { outcome: "approved" | "denied"; result?: string };

export type PendingCall = ToolCall & { reason?: string };

/**
 * Per-request state shared by the gated tools of one /chat turn. Outside a context
 * (CLI, arena, bench, MCP) the gate is inert and tools execute normally.
 */
export type ApprovalContext = {
  grants: Grant[];
  /** First sensitive call held in the turn; becomes the approval card. */
  pending?: PendingCall;
  /** Every held call, including repeats after the first. */
  held: ToolCall[];
};

export type GateDecision =
  | { kind: "execute" }
  | { kind: "replay"; result: string }
  | { kind: "deny" }
  | { kind: "hold"; first: boolean };

const storage = new AsyncLocalStorage<ApprovalContext>();

export const createApprovalContext = (grants: Grant[] = []): ApprovalContext => ({ grants, held: [] });

export const runWithApprovalContext = <T>(context: ApprovalContext, fn: () => Promise<T>): Promise<T> =>
  storage.run(context, fn);

export const getApprovalContext = (): ApprovalContext | undefined => storage.getStore();

/** Separates the approver-facing `reason` from the arguments the tool actually uses. */
export const splitReason = (input: Record<string, unknown>): { args: Record<string, unknown>; reason?: string } => {
  const { reason, ...args } = input;
  return typeof reason === "string" && reason.trim() ? { args, reason: reason.trim() } : { args };
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
};

/** Stable identity of a call: key order and `reason` do not matter. */
export const canonicalArgs = (args: Record<string, unknown>): string => JSON.stringify(sortKeys(splitReason(args).args));

const sameCall = (left: ToolCall, right: ToolCall): boolean =>
  left.tool === right.tool && canonicalArgs(left.args) === canonicalArgs(right.args);

export const decideGate = (context: ApprovalContext | undefined, call: ToolCall): GateDecision => {
  if (!context) return { kind: "execute" };
  const grant = context.grants.find((candidate) => sameCall(candidate, call));
  if (grant?.outcome === "approved") return { kind: "replay", result: grant.result ?? "" };
  if (grant?.outcome === "denied") return { kind: "deny" };
  return { kind: "hold", first: context.pending === undefined };
};

export const APPROVAL_REQUIRED_OBSERVATION = (tool: string): string =>
  `APPROVAL_REQUIRED: a ação ${tool} aguarda aprovação humana e NÃO foi executada. ` +
  "Não tente novamente; encerre informando que aguarda aprovação.";

export const DENIED_OBSERVATION = (tool: string): string =>
  `DENIED: a pessoa operadora negou ${tool}; a ação não foi executada.`;

/** Wraps a sensitive tool body so that, inside an approval context, it never runs without a grant. */
export const withApprovalGate = <I extends Record<string, unknown>, O>(
  tool: SensitiveTool,
  run: (input: I) => O,
) => async (input: I): Promise<Awaited<O> | string> => {
  const context = getApprovalContext();
  const decision = decideGate(context, { tool, args: input });
  if (decision.kind === "execute") return await run(input);
  if (decision.kind === "replay") return decision.result;
  if (decision.kind === "deny") return DENIED_OBSERVATION(tool);
  const { args, reason } = splitReason(input);
  context?.held.push({ tool, args });
  if (context && decision.first) context.pending = { tool, args, ...(reason ? { reason } : {}) };
  return APPROVAL_REQUIRED_OBSERVATION(tool);
};
