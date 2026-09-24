# Chat HTTP Contract (extensão aprendizado)

Extende `006-semantic-memory` / `005-persistent-conversation`.

## Endpoint

`POST /chat`

### Request body

Inalterado em relação a 006 (`userId` opcional).

### Success response `200`

```ts
{
  answer: string
  trace: TraceEvent[]
  metrics: {
    llmCalls: number
    latencyMs: number
    historyMessages: number
    memoryFacts: number
    learningQueued: boolean // novo — true se userId presente e schedule disparado
  }
  conversationId: string
}
```

## Composition (aprendizado)

1. Validar body; set request `userId` context (se presente).
2. Fluxo 006: recall → history → append user → `strategy.run` → append assistant.
3. Montar resposta com métricas (`learningQueued = Boolean(userId)` quando o
   schedule será/foi disparado).
4. Enviar `200` JSON.
5. Se `userId`: `scheduleLearning({ userId, userMessage: message, memories, reflect })`
   sem await.
6. Clear request context.

## Compatibility

- Sem `userId`: `learningQueued === false`; sem schedule; igual ao comportamento 006.
- Falhas do schedule **não** alteram a resposta já enviada.
- Timeout/404/400/422/504 existentes permanecem.
