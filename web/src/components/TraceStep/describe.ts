import type { GraphNode, PlanStep, TraceEvent } from "../../api/schemas";

export const NODE_LABELS: Record<GraphNode, string> = {
  context: "Contexto",
  router: "Roteador",
  react: "ReAct",
  "plan-and-execute": "Plano e execução",
  reflect: "Reflexão",
  response: "Resposta",
};

export const ROUTE_LABELS: Record<string, string> = {
  react: "ReAct",
  "plan-and-execute": "Plano e execução",
  reflect: "Reflexão",
};

export const STEP_STATUS_LABELS: Record<PlanStep["status"], string> = {
  pending: "Pendente",
  completed: "Concluído",
  failed: "Falhou",
};

export type TraceBody =
  | { kind: "text"; text: string }
  | { kind: "tool"; tool: string; argsJson: string }
  | {
      kind: "plan";
      steps: Array<{ id: number; description: string; tool?: string; status: PlanStep["status"]; statusLabel: string }>;
    }
  | { kind: "route"; route: string; reason: string }
  | { kind: "fallback"; fromModel: string; toModel: string; reason: string }
  | { kind: "unknown"; json: string };

export interface TraceDescription {
  label: string;
  nodeLabel?: string;
  highlight?: "approval";
  body: TraceBody;
}

function nodeLabelOf(node: unknown): string | undefined {
  return typeof node === "string" && node in NODE_LABELS ? NODE_LABELS[node as GraphNode] : undefined;
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "";
}

function withNode(description: TraceDescription, node: unknown): TraceDescription {
  const nodeLabel = nodeLabelOf(node);
  return nodeLabel ? { ...description, nodeLabel } : description;
}

/** Pure presentation of one trace event (labels in pt-BR; FR-008/FR-009). */
export function describeTraceEvent(event: TraceEvent): TraceDescription {
  if (event.kind === "unknown") {
    const { type: _type, node, ...rest } = event.raw;
    return withNode({ label: `Evento: ${event.type}`, body: { kind: "unknown", json: json(rest) } }, node);
  }
  switch (event.type) {
    case "route":
      return withNode(
        { label: "Rota", body: { kind: "route", route: ROUTE_LABELS[event.route] ?? event.route, reason: event.reason } },
        event.node,
      );
    case "thought":
      return withNode({ label: "Pensamento", body: { kind: "text", text: event.content } }, event.node);
    case "action":
      return withNode(
        { label: "Ação", body: { kind: "tool", tool: event.tool, argsJson: json(event.args) } },
        event.node,
      );
    case "observation": {
      const flagged = /^\s*(APPROVAL_REQUIRED|DENIED)\b/.test(event.content);
      const description: TraceDescription = { label: "Observação", body: { kind: "text", text: event.content } };
      if (flagged) description.highlight = "approval";
      return withNode(description, event.node);
    }
    case "plan":
      return withNode(
        {
          label: "Plano",
          body: {
            kind: "plan",
            steps: event.steps.map((step) => ({
              id: step.id,
              description: step.description,
              tool: step.tool,
              status: step.status,
              statusLabel: STEP_STATUS_LABELS[step.status],
            })),
          },
        },
        event.node,
      );
    case "critique":
      return withNode({ label: "Crítica", body: { kind: "text", text: event.content } }, event.node);
    case "fallback":
      return withNode(
        {
          label: "Troca de modelo",
          body: { kind: "fallback", fromModel: event.fromModel, toModel: event.toModel, reason: event.reason },
        },
        event.node,
      );
    case "summarize":
      return withNode({ label: "Resumo", body: { kind: "text", text: event.content } }, event.node);
    case "answer":
      return withNode({ label: "Resposta", body: { kind: "text", text: event.content } }, event.node);
  }
}
