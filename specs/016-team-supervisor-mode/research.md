# Research: Modo Equipe com Supervisor

Nenhum item do Technical Context ficou como NEEDS CLARIFICATION; as decisões
abaixo fecham os pontos em aberto da spec e do código existente.

## R1 — Como plugar a equipe no grafo de produção

- **Decision**: `createTeamStrategy(model, tools)` devolve uma `ReasoningStrategy` (`name: "team"`) que internamente compila um sub-`StateGraph`. O grafo de produção ganha o nó `team` e a rota `team`, executados por `runStrategy("team")` como as demais.
- **Rationale**: reaproveita `withNode`, `fallbackEvents`, métricas, `withReflection` e o nó `response` sem mudar o contrato de `ReasoningStrategy`; a equipe é testável isoladamente.
- **Alternatives considered**: nós supervisor/especialistas direto no grafo de produção (acopla e polui o estado global com o blackboard); subgrafo adicionado como nó LangGraph (perde a interface `ReasoningStrategy` usada por registry e reflexão).

## R2 — Decisão do supervisor (`withStructuredOutput({ next, brief })`)

- **Decision**: `supervisorDecisionSchema = z.object({ next: z.enum(["analista", "planejador", "executor", "done"]), brief: z.string().trim().min(1) })`. Quando `next = "done"`, o `brief` é a resposta final ao operador. O decisor é injetável (`DecideNext`) como o `DecideRoute` do roteador.
- **Rationale**: uma chamada por passagem, sem nó extra de síntese; o mesmo par `{ next, brief }` pedido pelo usuário cobre roteamento e resposta.
- **Alternatives considered**: nó "synthesizer" separado (+1 chamada LLM por turno); `brief` só como instrução e resposta = última contribuição (respostas pobres quando o último foi o analista).

## R3 — Teto 8

- **Decision**: no máximo 8 decisões do supervisor por turno, contando a de encerrar. A 8ª decisão é feita com schema restrito (`next: z.literal("done")`) e o evento `handoff` correspondente sai com `limitReached: true`. A função pura `mustFinish(state)` decide quando forçar.
- **Rationale**: garante teto rígido (nunca 9 handoffs) e sempre uma resposta composta a partir do blackboard, como a spec pede, sem falhar o turno.
- **Alternatives considered**: `recursionLimit` do LangGraph (lança erro em vez de responder); encerrar sem LLM com a última contribuição (resposta incoerente).

## R4 — Isolamento de papéis

- **Decision**: catálogo puro em `roles.ts`:
  - `analista` → `listAlerts`, `listIncidents`, `consultRunbook`, `checkProviderStatus`
  - `planejador` → nenhuma tool (chamada `model.invoke` sem `bindTools`)
  - `executor` → `listIncidents`, `openIncident`, `resolveIncident`
  - `forgetPreference` não pertence a nenhum papel.
  Analista e executor rodam via `createReactStrategy(model, subset)`; o tipo do parâmetro `tools` de `createReactStrategy` é ampliado para aceitar um subconjunto (`Partial<AgentTools>` / registro de tools estruturadas), sem mudar o comportamento atual.
- **Rationale**: o modelo não consegue chamar o que não foi ligado a ele — restrição por construção, testável comparando nomes de tools por papel. O prompt do analista complementa ("relate fatos, não proponha ações").
- **Alternatives considered**: filtrar no prompt (não é garantia); wrapper que recusa tools fora do papel em runtime (o modelo ainda as vê e gasta iterações).

## R5 — Aprovação humana sem bypass

- **Decision**: o executor usa a mesma instância de `resolveIncident` (com `withApprovalGate`). O `AsyncLocalStorage` do approval context propaga pelo sub-grafo porque tudo roda na mesma cadeia assíncrona do turno. Após cada passo do executor, se `getApprovalContext()?.pending` existir, `mustFinish` força a próxima decisão a `done` (supervisor com schema restrito, brief informando que aguarda aprovação). Observações `DENIED` entram no blackboard; como só o executor tem `resolve_incident` e o gate replica a negativa para a mesma chamada, não existe caminho alternativo.
- **Rationale**: zero código novo de aprovação; o fluxo 202 → cartão aprovar/negar da war room continua igual.
- **Alternatives considered**: gate próprio da equipe (duplicação e risco de divergência).

## R6 — Trace: evento `handoff` e identificação do papel

- **Decision**: novo `TraceEvent` `{ type: "handoff"; from: "supervisor"; to: "analista" | "planejador" | "executor" | "done"; brief: string; limitReached?: boolean; node?: GraphNode }`, emitido com `node: "supervisor"`. `GraphNode` ganha `"team" | "supervisor" | "analista" | "planejador" | "executor"`; os eventos de cada especialista são carimbados com o papel via `withNode` (que já preserva `node` existente), e o grafo de produção carimba o resto com `team`. `StrategyRoute` passa a incluir `"team"`.
- **Rationale**: a web já rotula etapas por `node`; basta acrescentar labels. Persistência de trace (013) guarda JSON, então nada muda no store.
- **Alternatives considered**: campo `role` separado em todos os eventos (mudança mais ampla no contrato).

## R7 — Logs

- **Decision**: `traceEventMeta` para `handoff` registra `{ to, limitReached }` e `chars` do brief — nunca o texto.
- **Rationale**: mantém a whitelist de metadados (013).

## R8 — Roteador

- **Decision**: linha nova na tabela: `| team | investigar, decidir e agir sobre incidentes em etapas com papeis separados |`. `PRODUCTION_ROUTES` inclui `team`, o que faz `isStrategyRoute` aceitar `strategy: "team"` no `/chat` sem mudar o handler.
- **Rationale**: aditivo; `UNKNOWN_STRATEGY` continua para nomes fora da lista.

## R9 — Reflexão e superfícies fora do HTTP

- **Decision**: `reflect: true` envolve a estratégia `team` com `withReflection`, como as outras. Arena, bench e MCP ficam fora de escopo.
- **Rationale**: consistência com 011; escopo pequeno.

## R10 — Web

- **Decision**: `routeNameSchema` e `graphNodeSchema` ganham os valores novos; `knownTraceEventSchema` ganha `handoff`; `describe.ts` mapeia `handoff` → label "Passagem", body `{ kind: "handoff", toLabel, brief, limitReached }`; labels: `team` "Equipe", `supervisor` "Supervisor", `analista` "Analista", `planejador` "Planejador", `executor` "Executor", `done` "Encerrar". Brief renderizado como texto.
- **Rationale**: segue o padrão existente de `route`/`fallback`; clientes antigos já degradavam para evento desconhecido, então a mudança é compatível.

## R11 — Persistência do trace com rota `team` (achado na implementação)

- **Decision**: a tabela `requests` (013) tinha `CHECK (route IN ('react', 'plan-and-execute', 'reflect'))`, o que faria todo turno `team` falhar ao gravar. O CHECK passa a incluir `'team'` e `migrate` reconstrói a tabela em arquivos antigos (cria cópia com o CHECK novo, copia as linhas, `DROP` + `RENAME`, recria índices, numa transação com `foreign_keys` desligado), preservando `trace_events`.
- **Rationale**: SQLite não altera CHECK por `ALTER TABLE`; o procedimento de reconstrução é o recomendado e é idempotente (só roda se o SQL da tabela não contém `'team'`).
- **Alternatives considered**: remover o CHECK (perde a validação de domínio); gravar `route = NULL` para `team` (perde a informação no `/stats`).
