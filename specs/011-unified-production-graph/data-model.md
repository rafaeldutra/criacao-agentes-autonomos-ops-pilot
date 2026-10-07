# Data Model: Grafo unificado de produção

## GraphNode

Identificador do nó emissor de um evento.

| Valor                 | Papel                                      |
|-----------------------|--------------------------------------------|
| `context`             | Montagem do prompt orçado                  |
| `router`              | Decisão de rota (LLM ou override)          |
| `react`               | Estratégia ReAct                           |
| `plan-and-execute`    | Estratégia Plan-and-Execute                |
| `reflect`             | ReAct + `withReflection`                   |
| `response`            | Consolidação da resposta / summarize HTTP  |

## StrategyRoute

Subconjunto de `GraphNode` executável: `react` | `plan-and-execute` | `reflect`.

## RouteDecision

| Campo    | Tipo            | Regras                                      |
|----------|-----------------|---------------------------------------------|
| `route`  | `StrategyRoute` | enumerado fechado                           |
| `reason` | `string`        | `min(1)`; override usa `"client override"`  |
| `source` | `"llm" \| "override"` | opcional interno; não obrigatório no JSON |

## TraceEvent (extensão)

Todas as variantes existentes ganham `node?: GraphNode`.

Nova variante:

```ts
{ type: "route"; route: StrategyRoute; reason: string; node?: GraphNode }
```

Evento de rota do grafo: `type: "route"`, `node: "router"`.

Helper: `withNode(events, node)` copia eventos preenchendo `node`.

## ProductionGraphState

Estado LangGraph (Annotation). Reducers: `trace` concatena; escalares
substituem.

| Campo               | Origem                         | Notas                                      |
|---------------------|--------------------------------|--------------------------------------------|
| `message`           | HTTP                           | mensagem do turno                          |
| `history`           | HTTP                           | janela pré-append                          |
| `summary`           | HTTP                           | string ou vazio                            |
| `memories`          | HTTP                           | fatos recall                               |
| `budget`            | HTTP                           | `SectionBudget`                            |
| `override`          | HTTP                           | `StrategyRoute \| undefined`               |
| `reflect`           | HTTP                           | boolean do body                            |
| `prompt`            | `context`                      | `buildContext(...).prompt`                 |
| `keptHistory`       | `context`                      | para `historyMessages`                     |
| `keptMemories`      | `context`                      | para `memoryFacts`                         |
| `contextBreakdown`  | `context`                      | pós-orçamento                              |
| `decision`          | `router`                       | `RouteDecision`                            |
| `answer`            | estratégia / `response`        | texto final                                |
| `trace`             | todos os nós                   | eventos com `node`                         |
| `llmCalls`          | router + estratégia            | soma                                       |
| `promptTokens`      | opcional                       | soma se houver usage                       |
| `startedAt`         | `invoke`                       | para `latencyMs` no `response`             |

## ProductionGraphResult

Saída de `invoke` / wrapper `runProductionGraph`:

- `answer: string`
- `trace: TraceEvent[]` (todos com `node`)
- `metrics`: `llmCalls`, `latencyMs`, `historyMessages`, `memoryFacts`,
  `contextBreakdown`, `promptTokens?`
- `route: StrategyRoute`

HTTP acrescenta `conversationId`, `learningQueued` e, se houver, evento
`summarize` com `node: "response"`.

## ChatTurn (fronteira)

Inalterado no schema Zod, com semântica nova:

| Campo           | Semântica                                              |
|-----------------|--------------------------------------------------------|
| `message`       | obrigatório                                            |
| `strategy`      | opcional; se presente, override ∈ StrategyRoute ou 422 |
| `reflect`       | default `false`; ver regra anti-duplo                  |
| `conversationId`| existente                                              |
| `userId`        | existente                                              |

## Erros de domínio

| Código           | Quando                                      | HTTP |
|------------------|---------------------------------------------|------|
| (string livre)   | `Unknown strategy: {name}`                  | 422  |
| `CONVERSATION_NOT_FOUND` | id inexistente                        | 404  |
| `ROUTER_FAILED`  | roteador LLM/parse                          | 502  |
| `CHAT_TIMEOUT`   | timeout existente                           | 504  |

## Transições

```text
START → context → router → (react | plan-and-execute | reflect) → response → END
```

Override não muda a topologia: o nó `router` ainda corre, sem LLM.

## Invariantes

- Exatamente uma estratégia-nó executa por turno bem-sucedido.
- Sem `strategy` no body ⇒ `override` ausente ⇒ LLM `decideRoute`.
- Eventos do grafo sempre têm `node`.
- `reason` nunca vazio no evento `route`.
