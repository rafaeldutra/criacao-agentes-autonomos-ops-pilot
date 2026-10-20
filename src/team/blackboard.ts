import type { TeamRole } from "../agents/types.js";
import { ROLE_LABELS } from "./roles.js";

/** One contribution of a specialist to the shared board of the turn. */
export type BlackboardEntry = {
  seq: number;
  role: TeamRole;
  brief: string;
  content: string;
  failed?: boolean;
};

export const appendEntry = (
  entries: readonly BlackboardEntry[],
  role: TeamRole,
  brief: string,
  content: string,
  failed = false,
): BlackboardEntry[] => [
  ...entries,
  { seq: entries.length + 1, role, brief, content, ...(failed ? { failed: true } : {}) },
];

/** Plain-text board for prompts: the request plus every contribution in order. */
export const blackboardAsText = (request: string, entries: readonly BlackboardEntry[]): string => {
  const body = entries.length
    ? entries
        .map((entry) =>
          [
            `#${entry.seq} ${ROLE_LABELS[entry.role]}${entry.failed ? " (falhou)" : ""}`,
            `instrução: ${entry.brief}`,
            `resultado: ${entry.content}`,
          ].join("\n"),
        )
        .join("\n\n")
    : "(vazio)";
  return `Pedido:\n${request}\n\nQuadro:\n${body}`;
};
