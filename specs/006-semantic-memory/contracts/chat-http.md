# Chat HTTP Contract (extensão memória)

Extende o contrato de `005-persistent-conversation` — campos e comportamentos
anteriores permanecem válidos.

## Endpoint

`POST /chat`

### Request body (Zod)

| Field | Type | Rules |
|---|---|---|
| `message` | string | trim, min 1 (existente) |
| `strategy` | string | opcional (existente) |
| `reflect` | boolean | opcional, default false (existente) |
| `conversationId` | string | opcional; se presente: trim, min 1 (existente) |
| `userId` | string | **novo**, opcional; se presente: trim, min 1 |

### Success response `200`

```ts
{
  answer: string
  trace: TraceEvent[]
  metrics: {
    llmCalls: number
    latencyMs: number
    historyMessages: number // 0..12
    memoryFacts: number     // 0..3 — fatos injetados neste turno
  }
  conversationId: string
}
```

### Error responses

Inalterados: `400` Zod, `404` conversa desconhecida, `422` strategy, `504`
timeout. `userId` inválido (presente porém vazio após trim) → `400`.

## Composition behavior (com memória)

1. Validar body (inclui `userId?`).
2. Resolver conversa como na feature 005.
3. `history = conversations.lastMessages(id, 12)`.
4. Se `userId` presente:
   `facts = await memories.recall(userId, message)`;
   senão `facts = []`.
5. `composed = formatMemoryBlock(facts) + formatChatHistory(history, message)`
   (bloco de memória omitido se `facts` vazio).
6. `append` user → `strategy.run(composed)` → `append` assistant.
7. Responder com métricas mescladas:
   `historyMessages: history.length`,
   `memoryFacts: facts.length`.

## Compatibility

- Clientes que omitem `userId` continuam válidos; `memoryFacts` deve ser `0`.
- Arena/bench/MCP não são obrigados a usar memória nesta feature.
- `createApp` / composição aceitam `memories?: MemoryStore` injetável
  (default seguro para testes: fake ou store sem fatos).
