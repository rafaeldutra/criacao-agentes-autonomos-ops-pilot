import { describe, expect, it } from "vitest";
import { chatOkSchema, traceEventSchema } from "../../api/schemas";
import { chat200 } from "../../test/fixtures";
import { describeTraceEvent } from "./describe";

const parse = (event: unknown) => traceEventSchema.parse(event);

describe("describeTraceEvent", () => {
  it("labels every event type of the fixture", () => {
    const labels = chatOkSchema.parse(chat200()).trace.map((event) => describeTraceEvent(event).label);
    expect(labels).toEqual([
      "Rota",
      "Pensamento",
      "Ação",
      "Observação",
      "Plano",
      "Crítica",
      "Troca de modelo",
      "Resumo",
      "Resposta",
      "Evento: telemetry",
    ]);
  });

  it.each([
    ["context", "Contexto"],
    ["router", "Roteador"],
    ["react", "ReAct"],
    ["plan-and-execute", "Plano e execução"],
    ["reflect", "Reflexão"],
    ["response", "Resposta"],
  ])("labels node %s as %s", (node, label) => {
    expect(describeTraceEvent(parse({ type: "thought", content: "x", node })).nodeLabel).toBe(label);
  });

  it("builds structured bodies", () => {
    expect(describeTraceEvent(parse({ type: "action", tool: "list_alerts", args: { a: 1 } })).body).toEqual({
      kind: "tool",
      tool: "list_alerts",
      argsJson: '{\n  "a": 1\n}',
    });
    expect(describeTraceEvent(parse({ type: "route", route: "reflect", reason: "r" })).body).toEqual({
      kind: "route",
      route: "Reflexão",
      reason: "r",
    });
    expect(
      describeTraceEvent(parse({ type: "plan", steps: [{ id: 1, description: "d", status: "failed" }] })).body,
    ).toMatchObject({ kind: "plan", steps: [{ statusLabel: "Falhou" }] });
    expect(describeTraceEvent(parse({ type: "telemetry", foo: 1 })).body).toEqual({
      kind: "unknown",
      json: '{\n  "foo": 1\n}',
    });
  });

  it("flags APPROVAL_REQUIRED and DENIED observations", () => {
    expect(describeTraceEvent(parse({ type: "observation", content: "APPROVAL_REQUIRED: x" })).highlight).toBe(
      "approval",
    );
    expect(describeTraceEvent(parse({ type: "observation", content: "DENIED: x" })).highlight).toBe("approval");
    expect(describeTraceEvent(parse({ type: "observation", content: "ok" })).highlight).toBeUndefined();
  });
});
