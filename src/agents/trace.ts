import type { GraphNode, PlanStep, StrategyRoute, TraceEvent } from "./types.js";

export const thought = (content: string): TraceEvent => ({ type: "thought", content });
export const action = (tool: string, args: Record<string, unknown>): TraceEvent => ({
  type: "action",
  tool,
  args,
});
export const observation = (content: string): TraceEvent => ({ type: "observation", content });
export const plan = (steps: PlanStep[]): TraceEvent => ({ type: "plan", steps });
export const critique = (content: string): TraceEvent => ({ type: "critique", content });
export const answer = (content: string): TraceEvent => ({ type: "answer", content });
export const summarize = (content: string): TraceEvent => ({ type: "summarize", content });
export const route = (selectedRoute: StrategyRoute, reason: string, node: GraphNode = "router"): TraceEvent => ({
  type: "route",
  route: selectedRoute,
  reason,
  node,
});

export const withNode = (events: readonly TraceEvent[], node: GraphNode): TraceEvent[] =>
  events.map((event) => ({ ...event, node: event.node ?? node }));

export const formatTrace = (events: readonly TraceEvent[]): string =>
  events
    .map((event) => {
      const label = event.node ? `${event.type}@${event.node}` : event.type;
      if (event.type === "route") {
        return `[${label}] ${event.route} ${event.reason}`;
      }
      if (event.type === "action") {
        return `[${label}] ${event.tool} ${JSON.stringify(event.args)}`;
      }
      if (event.type === "plan") {
        return `[${label}] ${event.steps.map((step) => step.description).join("; ")}`;
      }
      return `[${label}] ${event.content}`;
    })
    .join("\n");
