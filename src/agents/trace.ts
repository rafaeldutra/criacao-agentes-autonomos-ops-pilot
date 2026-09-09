import type { PlanStep, TraceEvent } from "./types.js";

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

export const formatTrace = (events: readonly TraceEvent[]): string =>
  events
    .map((event) => {
      if (event.type === "action") {
        return `[action] ${event.tool} ${JSON.stringify(event.args)}`;
      }
      if (event.type === "plan") {
        return `[plan] ${event.steps.map((step) => step.description).join("; ")}`;
      }
      return `[${event.type}] ${event.content}`;
    })
    .join("\n");
