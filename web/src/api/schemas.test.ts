import { describe, expect, it } from "vitest";
import { chat200, chat202, chatTeam200, decision409, decisionApprove200 } from "../test/fixtures";
import { apiErrorSchema, chatOkSchema, chatPendingSchema, decisionOkSchema, traceEventSchema } from "./schemas";

describe("API schemas", () => {
  it("parses the contract fixtures with the matching schema", () => {
    expect(chatPendingSchema.parse(chat202()).approval.status).toBe("pending");
    expect(decisionOkSchema.parse(decisionApprove200()).approval.status).toBe("approved");
    const conflict = apiErrorSchema.parse(decision409());
    expect(conflict.code).toBe("APPROVAL_ALREADY_DECIDED");
    expect(conflict.approval?.status).toBe("denied");
  });

  it("keeps every known trace event typed and the unknown one as a fallback", () => {
    const parsed = chatOkSchema.parse(chat200());
    const known = parsed.trace.filter((event) => event.kind === "known").map((event) => event.type);
    expect(known).toEqual([
      "route",
      "thought",
      "action",
      "observation",
      "plan",
      "critique",
      "fallback",
      "summarize",
      "answer",
    ]);
    const unknown = parsed.trace.at(-1);
    expect(unknown).toEqual({ kind: "unknown", type: "telemetry", raw: { type: "telemetry", foo: 1 } });
  });

  it("strips extra response fields instead of rejecting them", () => {
    const parsed = chatOkSchema.parse(chat200());
    expect(parsed).not.toHaveProperty("prompt");
  });

  it("rejects a 200 body without answer", () => {
    const { answer: _answer, ...rest } = chat200();
    expect(chatOkSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects events without a string type", () => {
    expect(traceEventSchema.safeParse({ foo: 1 }).success).toBe(false);
  });

  it("accepts the team route, team nodes and typed handoff events", () => {
    const body = chatOkSchema.parse(chatTeam200());
    expect(body.route).toBe("team");
    const handoffs = body.trace.filter((event) => event.kind === "known" && event.type === "handoff");
    expect(handoffs).toHaveLength(4);
    expect(body.trace.every((event) => event.kind === "known")).toBe(true);
    for (const node of ["team", "supervisor", "analista", "planejador", "executor"]) {
      expect(traceEventSchema.parse({ type: "thought", content: "x", node }).kind).toBe("known");
    }
  });

  it("keeps a malformed handoff as a generic event", () => {
    expect(traceEventSchema.parse({ type: "handoff", from: "supervisor", to: "analista" }).kind).toBe("unknown");
    expect(traceEventSchema.parse({ type: "handoff", from: "supervisor", to: "dba", brief: "x" }).kind).toBe("unknown");
  });
});
