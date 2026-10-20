import { z } from "zod";

/**
 * Zod schemas for the OpsPilot HTTP contract (specs/014-war-room-web/contracts/).
 * Response objects are intentionally non-strict: unknown keys (e.g. `prompt`, `keptHistory`)
 * are stripped instead of rejected.
 */

export const graphNodeSchema = z.enum([
  "context",
  "router",
  "react",
  "plan-and-execute",
  "reflect",
  "team",
  "supervisor",
  "analista",
  "planejador",
  "executor",
  "response",
]);
export type GraphNode = z.infer<typeof graphNodeSchema>;

const routeNameSchema = z.enum(["react", "plan-and-execute", "reflect", "team"]);
export const teamTargetSchema = z.enum(["analista", "planejador", "executor", "done"]);
export type TeamTarget = z.infer<typeof teamTargetSchema>;
const nodeField = { node: graphNodeSchema.optional() };
const argsSchema = z.record(z.string(), z.unknown());

export const planStepSchema = z.object({
  id: z.number(),
  description: z.string(),
  tool: z.string().optional(),
  args: argsSchema.optional(),
  status: z.enum(["pending", "completed", "failed"]),
});
export type PlanStep = z.infer<typeof planStepSchema>;

export const knownTraceEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thought"), content: z.string(), ...nodeField }),
  z.object({ type: z.literal("action"), tool: z.string(), args: argsSchema, ...nodeField }),
  z.object({ type: z.literal("observation"), content: z.string(), ...nodeField }),
  z.object({ type: z.literal("plan"), steps: z.array(planStepSchema), ...nodeField }),
  z.object({ type: z.literal("critique"), content: z.string(), ...nodeField }),
  z.object({ type: z.literal("answer"), content: z.string(), ...nodeField }),
  z.object({ type: z.literal("summarize"), content: z.string(), ...nodeField }),
  z.object({ type: z.literal("route"), route: routeNameSchema, reason: z.string(), ...nodeField }),
  z.object({
    type: z.literal("fallback"),
    fromModel: z.string(),
    toModel: z.string(),
    reason: z.string(),
    ...nodeField,
  }),
  z.object({
    type: z.literal("handoff"),
    from: z.literal("supervisor"),
    to: teamTargetSchema,
    brief: z.string(),
    limitReached: z.boolean().optional(),
    ...nodeField,
  }),
]);
export type KnownTraceEvent = z.infer<typeof knownTraceEventSchema>;
export type KnownTraceEventEntry = KnownTraceEvent & { kind: "known" };

export interface UnknownTraceEvent {
  kind: "unknown";
  type: string;
  raw: Record<string, unknown>;
}

export type TraceEvent = KnownTraceEventEntry | UnknownTraceEvent;

/** Known events are fully typed; anything else with a string `type` is kept as a generic event (FR-009). */
export const traceEventSchema: z.ZodType<TraceEvent> = z.union([
  knownTraceEventSchema.transform((event): KnownTraceEventEntry => ({ ...event, kind: "known" })),
  z
    .looseObject({ type: z.string() })
    .transform((event): UnknownTraceEvent => ({ kind: "unknown", type: event.type, raw: { ...event } })),
]);

export const metricsSchema = z.object({
  llmCalls: z.number().optional(),
  latencyMs: z.number().optional(),
  historyMessages: z.number().optional(),
  memoryFacts: z.number().optional(),
  learningQueued: z.boolean().optional(),
  promptTokens: z.number().optional(),
  modelUsed: z.string().optional(),
  contextBreakdown: z.record(z.string(), z.number()).optional(),
});
export type Metrics = z.infer<typeof metricsSchema>;

export const approvalStatusSchema = z.enum(["pending", "approved", "denied", "failed", "expired"]);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const approvalSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  requestId: z.string(),
  tool: z.string(),
  args: argsSchema,
  reason: z.string(),
  status: approvalStatusSchema,
  createdAt: z.string(),
  decidedAt: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  resumeRequestId: z.string().nullable().optional(),
});
export type Approval = z.infer<typeof approvalSchema>;

export const chatOkSchema = z.object({
  requestId: z.string(),
  conversationId: z.string(),
  answer: z.string(),
  route: z.string(),
  trace: z.array(traceEventSchema),
  metrics: metricsSchema,
});
export type ChatOk = z.infer<typeof chatOkSchema>;

export const chatPendingSchema = chatOkSchema.extend({
  status: z.literal("pending_approval"),
  approval: approvalSchema,
});
export type ChatPending = z.infer<typeof chatPendingSchema>;

export const decisionOkSchema = chatOkSchema.extend({ approval: approvalSchema });
export type DecisionOk = z.infer<typeof decisionOkSchema>;

export const decisionPendingSchema = chatPendingSchema.extend({ decided: approvalSchema });
export type DecisionPending = z.infer<typeof decisionPendingSchema>;

export const apiErrorSchema = z.object({
  requestId: z.string().optional(),
  error: z.string().optional(),
  code: z.string().optional(),
  issues: z.array(z.unknown()).optional(),
  approval: approvalSchema.optional(),
  approvalId: z.string().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
