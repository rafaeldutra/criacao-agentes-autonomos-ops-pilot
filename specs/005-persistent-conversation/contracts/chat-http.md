# Chat HTTP Contract

## Endpoint

`POST /chat`

### Request body (Zod)

| Field | Type | Rules |
|---|---|---|
| `message` | string | trim, min 1 (existente) |
| `strategy` | string | opcional (existente) |
| `reflect` | boolean | opcional, default false (existente) |
| `conversationId` | string | opcional; se presente: trim, min 1 |

### Success response `200`

```ts
{
  answer: string
  trace: TraceEvent[]
  metrics: {
    llmCalls: number
    latencyMs: number
    historyMessages: number // 0..12
  }
  conversationId: string
}
```

### Error responses

| Status | Quando |
|---|---|
| `400` | Body inválido (Zod), como hoje |
| `404` | `conversationId` fornecido mas desconhecido (`CONVERSATION_NOT_FOUND`) |
| `422` | Strategy desconhecida (existente) |
| `504` | Timeout (existente) |

## Composition behavior

1. Validar body.
2. Resolver `conversationId`: omitido → `store.create()`; presente →
   `store.exists` / rejeitar se falso.
3. `history = store.lastMessages(id, 12)`.
4. `composed = formatHistory(history) + current message`.
5. `append(id, "user", message)`.
6. `result = strategy.run(composed)` (com timeout existente).
7. `append(id, "assistant", result.answer)`.
8. Responder com `...result`, `conversationId: id`,
   `metrics: { ...result.metrics, historyMessages: history.length }`.

## Compatibility

- Clientes que omitem `conversationId` continuam válidos; passam a receber
  `conversationId` e `historyMessages` aditivos.
- Arena/bench/MCP não são obrigados a usar conversas nesta feature.
