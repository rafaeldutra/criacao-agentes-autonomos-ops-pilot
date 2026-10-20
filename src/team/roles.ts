import type { AgentTools } from "../agents/tools.js";
import type { TeamRole } from "../agents/types.js";

export const TEAM_ROLES = ["analista", "planejador", "executor"] as const satisfies readonly TeamRole[];

/**
 * Tools each role can reach. Isolation is structural: a specialist is only ever
 * bound to these, so it cannot call anything else whatever the prompt says.
 * `forgetPreference` belongs to no role.
 */
export const ROLE_TOOL_KEYS: Readonly<Record<TeamRole, readonly (keyof AgentTools)[]>> = {
  analista: ["listAlerts", "listIncidents", "consultRunbook", "checkProviderStatus"],
  planejador: [],
  executor: ["listIncidents", "openIncident", "resolveIncident"],
};

export const toolsForRole = (tools: AgentTools, role: TeamRole): Partial<AgentTools> =>
  Object.fromEntries(ROLE_TOOL_KEYS[role].map((key) => [key, tools[key]])) as Partial<AgentTools>;

export const ROLE_PROMPTS: Readonly<Record<TeamRole, string>> = {
  analista: `Você é o ANALISTA do plantão. Sua única função: produzir um diagnóstico FACTUAL do estado atual com as ferramentas de leitura.
Liste: alertas disparando (com data e severidade), incidentes recentes (abertos e resolvidos), runbooks relevantes, status dos provedores e janelas/fatos conhecidos do time.
NÃO proponha soluções. NÃO abra nem resolva incidentes. Formato: tópicos telegráficos.
Seja cético: se um dado não está nas observações, não o afirme.`,
  planejador: `Você é o PLANEJADOR do plantão. Você não tem ferramentas e não consulta dados.
A partir apenas do quadro (blackboard) e da instrução recebida, produza um plano numerado, curto e executável.
Cada passo diz o que fazer, sobre qual serviço/incidente e por quê, citando o fato do quadro que o justifica.
Se faltar um fato necessário, diga qual e não invente.`,
  executor: `Você é o EXECUTOR do plantão. Execute apenas as ações sobre incidentes pedidas na instrução (listar, abrir, resolver).
Ao resolver um incidente, sempre preencha reason explicando por que a ação é necessária agora.
Ações sensíveis exigem aprovação humana: se uma ferramenta responder APPROVAL_REQUIRED ou DENIED, não tente de novo nem por outro caminho; relate e encerre.
Responda com o que foi feito, o id de cada incidente afetado e o que ficou pendente.`,
};

export const ROLE_LABELS: Readonly<Record<TeamRole, string>> = {
  analista: "Analista",
  planejador: "Planejador",
  executor: "Executor",
};
