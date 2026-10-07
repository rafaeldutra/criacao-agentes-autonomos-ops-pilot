# Research: Grafo unificado de produção

## Decision: LangGraph `StateGraph` em `src/agents/production-graph.ts`

**Decision**: Compôr o fluxo de produção como `StateGraph` (mesmo padrão de
Plan-and-Execute) com nós `context` → `router` → um de `{react, plan-and-execute,
reflect}` → `response`. Arestas condicionais a partir do roteador; `START` entra
em `context`.

**Rationale**: A spec pede um grafo único com esses nós. O projeto já usa
`Annotation` + `StateGraph` + `withStructuredOutput`. Encapsular em um arquivo
evita espalhar roteamento no handler HTTP.

**Alternatives considered**: Cadeia sequencial no `runChat` sem LangGraph —
rejeitada (não cumpre o artefato `production-graph.ts` nem nós explícitos).
Três graphs paralelos — rejeitada (não unifica observabilidade).

## Decision: IO na borda HTTP; nó `context` só monta o prompt

**Decision**: `runChat` continua a resolver conversa, `lastMessages`, resumo,
`recall` e budget. O grafo recebe essas fontes já carregadas. O nó `context`
chama `buildContext` + `buildContextBreakdown` (010) e grava `prompt`,
`keptHistory`/`keptMemories` e um evento `thought` com `node: "context"`.
Append user/assistant, timeout, sumarização e learning permanecem no HTTP.

**Rationale**: Constituição I (IO na borda) e FR-013. O grafo fica testável com
fixtures sem stores. A ordem “histórico pré-append → compose → run” de 010
preserva-se: o handler carrega o histórico, invoca o grafo, e faz append user
imediatamente antes do `invoke` (ou após o compose interno, desde que o
histórico passado ao grafo seja o pré-append — o handler não deve reler o
store após o append do user para montar contexto).

Ordem canônica:

1. Validar body; 422 se `strategy` presente e fora do enumerado.
2. Resolver conversa / 404.
3. Carregar history, summary, facts, budget.
4. `append(user)`.
5. `graph.invoke({ message, history, summary, memories, budget, override, reflect })`.
6. `append(assistant)`; maybeSummarize; 200; scheduleLearning.

**Alternatives considered**: Stores dentro do grafo — rejeitado (acopla domínio
a IO). Manter `buildContext` só no HTTP e nó `context` no-op — rejeitado (FR-002
pede o nó como responsável pela montagem).

## Decision: Roteador `withStructuredOutput` + tabela; override sem LLM

**Decision**: Schema Zod `{ route: z.enum(["react","plan-and-execute","reflect"]),
reason: z.string().min(1) }`. Default: `model.withStructuredOutput(schema)` com
prompt contendo tabela markdown de critérios (spec Assumptions). Função
`decideRoute(prompt)` injetável para testes.

Se `override` está definido, o nó `router` **não** chama o modelo: emite
`{ route: override, reason: "client override" }` (texto estável) e
`llmCalls += 0`. Caso contrário, `llmCalls += 1` na decisão bem-sucedida.

Falha (throw do modelo, parse, `reason` vazio): `DomainError` código
`ROUTER_FAILED`. HTTP traduz para **502**. Sem fallback silencioso para `react`.

**Rationale**: FR-003–FR-006, FR-012; testes determinísticos exigem injeção
(padrão 002/007). 502 distingue falha do provedor de 422 de contrato.

**Alternatives considered**: Default `react` se o roteador falhar — rejeitado
pela spec. Heurística regex — rejeitada (`withStructuredOutput` é requisito).
HTTP 500 genérico — pior para o cliente.

## Decision: Três nós de estratégia reutilizam o registry; `reflect` envolve ReAct

**Decision**: `createProductionGraph` recebe as estratégias do registry
(`react`, `plan-and-execute`) e constrói o nó `reflect` com
`withReflection(react, reflectionOptions)` uma vez. Cada nó chama
`strategy.run(state.prompt)` e carimba `node` em todos os eventos retornados.

Flag HTTP `reflect`:

- rota `reflect` → não reaplicar o decorator;
- outras rotas + `reflect: true` → `withReflection` na estratégia da rota
  (mesmo `resolveStrategy` de hoje).

**Rationale**: Assumptions da spec; Arena/bench intactos; um único ReAct
refletido no grafo de produção.

**Alternatives considered**: Nó `reflect` como decorator da rota escolhida
(dois hops) — rejeitado (a spec lista `reflect` como terceira estratégia).
Exigir `reflect` no registry HTTP — quebraria `createAgentRegistry` atual.

## Decision: `node` opcional no tipo; obrigatório na saída do grafo

**Decision**: Estender cada variante de `TraceEvent` com `node?: GraphNode`.
Helper puro `withNode(events, node)` / `routeEvent(decision)`. Arena e
estratégias isoladas podem omitir `node`. O grafo **sempre** preenche.

Evento `summarize` pós-turno (009) anexado no HTTP recebe `node: "response"`
para o JSON do chat ficar homogêneo.

`formatTrace`: eventos `route` como
`[route] <route> (<reason>)`; se `node` existir, prefixo
`[<type>@<node>]` (não quebra asserts atuais se testes não exigem `@`;
atualizar `formatTrace` para incluir `@node` só quando presente, mantendo
`[thought] ...` quando ausente).

**Rationale**: FR-008/FR-009 sem quebrar Arena. Testes de format atual
continuam válidos.

**Alternatives considered**: `node` obrigatório em todos os traces — rejeitado
(Arena/estratégias). Tipo envelope separado — rejeitado (contrato `/chat`
já devolve `trace` plano).

## Decision: `/chat` deixa de defaultar `react`; testes injetam `decideRoute`

**Decision**: `strategy` omitido ⇒ `override` undefined ⇒ roteador automático.
`createApp` / `runChat` aceitam `decideRoute` e/ou `productionGraph` injetados.
Testes HTTP existentes passam `decideRoute: async () => ({ route: "react",
reason: "test" })` (ou o default de teste no helper `withServer`) para não
exigir LLM. Casos novos cobrem override e rotas injetadas distintas.

Validação: `strategy` se presente deve ser um dos três nomes; senão 422
`Unknown strategy: ...` **antes** de append/invoke. Aliases de Arena
(`reflect:react`) não são válidos no `/chat`.

**Rationale**: FR-007, FR-011, FR-014; constituição V (CI verde sem rede).

**Alternatives considered**: Manter default `react` quando omitido — rejeitado
pela spec. Zod `enum` ⇒ 400 — rejeitado (contrato atual é 422).

## Decision: Métricas do grafo

**Decision**: `latencyMs` = parede do `invoke` completo. `llmCalls` = chamadas
do roteador (0 ou 1) + `metrics.llmCalls` da estratégia. `promptTokens`:
`addOptionalPromptTokens` (já usado em P&E) entre roteador e estratégia.
`contextBreakdown` / `historyMessages` / `memoryFacts` saem do nó `context`
(pós-orçamento), como 010.

**Rationale**: FR-010, FR-012; sem dupla contagem.

**Alternatives considered**: Latência só da estratégia — rejeitado (spec pede
execução completa do grafo).
