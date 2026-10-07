# Chat HTTP Contract (extensão grafo unificado)

Extende composição 010 / métricas 008 / conversa 005.

## Endpoint

`POST /chat`

### Request body

Schema Zod inalterado (`strategy` string opcional). Semântica:

| `strategy` | Comportamento |
|------------|----------------|
| omitido / não enviado | roteador automático (não defaulta `react`) |
| `react` \| `plan-and-execute` \| `reflect` | override; evento `route` com `reason: "client override"` |
| qualquer outro (incl. `reflect:react`) | **422** `{ error: "Unknown strategy: {name}" }` antes do grafo |

`reflect: true` continua válido; não duplica decorator se a rota for `reflect`.

### Success response `200`

Campos existentes (`answer`, `trace`, `metrics`, `conversationId`, …).

`trace` passa a poder incluir:

```json
{ "type": "route", "route": "react", "reason": "…", "node": "router" }
```

Todo evento do grafo inclui `"node"`. Evento `summarize` de 009, se anexado,
usa `"node": "response"`.

`metrics.llmCalls` inclui a chamada do roteador quando não houve override.
`metrics.latencyMs` cobre o `invoke` do grafo (não o learning 007).

### Error responses

| Status | Quando |
|--------|--------|
| 400 | Zod (body inválido) |
| 404 | conversa inexistente |
| 422 | strategy desconhecida |
| 502 | `{ error, code: "ROUTER_FAILED" }` |
| 504 | timeout existente |

## Composition

1. Validar body.
2. Se `strategy` presente e ∉ enumerado → 422.
3. Resolver conversa; carregar history/summary/facts/budget.
4. Append user.
5. `productionGraph.invoke({ message, history, summary, memories, budget, override, reflect })`.
6. Append assistant; `maybeSummarizeAfterTurn` (009).
7. 200; `scheduleLearning` (007) inalterado.

`buildContext` **não** permanece duplicado no handler: vive no nó `context`.

## Compatibility

- Arena, bench e MCP **não** usam o grafo.
- Clientes que omitiam `strategy` deixam de cair em `react` fixo.
- Clientes que enviavam `strategy: "react"` | `"plan-and-execute"` continuam
  forçando o modo (agora via override + evento `route`).
- `strategy: "reflect"` passa a ser nome válido no chat (antes 422).

## Test obligations (HTTP)

| Case | Expect |
|------|--------|
| sem `strategy`, `decideRoute` → react | 200; route event LLM/stub reason; só stub react chamado |
| `strategy: "plan-and-execute"` | P&E chamado; reason `client override`; `decideRoute` não chamado |
| `strategy: "unknown"` | 422; stores sem append |
| `decideRoute` falha | 502 `ROUTER_FAILED` |
| todos os eventos do 200 | campo `node` presente |
| budget baixo (010) | breakdown/kept* iguais; prompt via grafo |
