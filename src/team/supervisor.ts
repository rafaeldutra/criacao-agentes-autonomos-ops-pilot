import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { ResilientModel } from "../agents/model.js";
import { ModelUnavailableError } from "../agents/model.js";
import { RouterError } from "../agents/production-graph.js";

/** Supervisor decisions per turn, the final `done` included. */
export const TEAM_MAX_DECISIONS = 8;

const briefSchema = z
  .string()
  .trim()
  .min(1)
  .describe("instrução de trabalho para o próximo papel (nó) ou resumo final se done");

export const supervisorDecisionSchema = z.object({
  next: z.enum(["analista", "planejador", "executor", "done"]),
  brief: briefSchema,
});

/** Used when the team must stop: the only valid move is the final answer. */
export const doneOnlySchema = z.object({
  next: z.literal("done"),
  brief: briefSchema,
});

export type SupervisorDecision = z.infer<typeof supervisorDecisionSchema>;
export type FinishReason = "limit" | "approval";

export type DecideNext = (input: {
  blackboard: string;
  forceFinish: boolean;
  reason?: FinishReason;
}) => Promise<SupervisorDecision>;

export const SUPERVISOR_PROMPT = `Você é o SUPERVISOR de uma equipe de plantão do OpsPilot. Você não usa ferramentas: lê o quadro e decide quem age em seguida.

| papel | quando acionar |
|-------|----------------|
| analista | falta diagnóstico factual (alertas, incidentes, runbooks, status de provedores); só lê, não propõe |
| planejador | já há fatos suficientes e é preciso decidir o que fazer; não consulta dados |
| executor | há um plano aprovado no quadro que exige abrir, listar ou resolver incidentes |
| done | o pedido está respondido, ou não há mais nada útil a fazer |

Critérios de sequência: fatos antes de plano, plano antes de ação; não repita um papel sem motivo novo no quadro.
Em "brief", dê ao papel escolhido uma instrução curta e concreta.
Ao escolher "done", "brief" é a resposta final à pessoa de plantão, em português, baseada apenas no quadro.
Se o quadro mostrar APPROVAL_REQUIRED, informe que a ação aguarda aprovação humana; se mostrar DENIED, informe que foi negada.`;

const FORCE_NOTES: Readonly<Record<FinishReason, string>> = {
  limit: `O teto de ${TEAM_MAX_DECISIONS} passagens foi atingido: responda agora com next = "done" e a melhor resposta possível a partir do quadro.`,
  approval:
    'Há uma ação aguardando aprovação humana: responda agora com next = "done", dizendo o que foi feito e o que aguarda aprovação.',
};

/** Pure: when the next decision has to be the final one. Approval wins over the ceiling. */
export const mustFinish = (state: { decisions: number; approvalPending: boolean }): {
  force: boolean;
  reason?: FinishReason;
} => {
  if (state.approvalPending) return { force: true, reason: "approval" };
  if (state.decisions >= TEAM_MAX_DECISIONS - 1) return { force: true, reason: "limit" };
  return { force: false };
};

export const assertSupervisorDecision = (value: unknown, forceFinish = false): SupervisorDecision => {
  const parsed = (forceFinish ? doneOnlySchema : supervisorDecisionSchema).safeParse(value);
  if (!parsed.success) throw new RouterError("Team supervisor returned an invalid decision");
  return parsed.data;
};

export const createDefaultDecideNext = (model: ResilientModel): DecideNext => async ({ blackboard, forceFinish, reason }) => {
  const schema = forceFinish ? doneOnlySchema : supervisorDecisionSchema;
  const user = forceFinish && reason ? `${blackboard}\n\n${FORCE_NOTES[reason]}` : blackboard;
  try {
    const verdict = await model.withStructuredOutput(schema).invoke([
      new SystemMessage(SUPERVISOR_PROMPT),
      new HumanMessage(user),
    ]);
    return assertSupervisorDecision(verdict, forceFinish);
  } catch (error) {
    if (error instanceof RouterError || error instanceof ModelUnavailableError) throw error;
    throw new RouterError("Team supervisor failed to decide");
  }
};
