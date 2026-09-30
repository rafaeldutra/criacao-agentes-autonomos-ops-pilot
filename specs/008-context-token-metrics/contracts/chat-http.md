# Chat HTTP Contract (extensão métricas de contexto)

Extende `007-learning-reflector` / `006-semantic-memory`.

## Endpoint

`POST /chat`

### Request body

Inalterado.

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
    learningQueued: boolean
    promptTokens?: number           // novo — real; omitido se sem usage
    contextBreakdown: {             // novo — sempre presente
      memory: number
      history: number
      message: number
    }
  }
  conversationId: string
}
```

## Composition (métricas de contexto)

1. Validar body; fluxo existente (recall → history → compose → append → run → append).
2. Calcular textos:
   - `memoryText = formatMemoryBlock(facts)`
   - `historyText =` janela formatada **sem** mensagem atual
   - `messageText = \`user: ${message}\``
3. `contextBreakdown = buildContextBreakdown({ memory: memoryText, history: historyText, message: messageText })`
4. Obter `promptTokens` de `result.metrics.promptTokens` (strategies via
   `sumPromptTokensFromMessages` / acumuladores equivalentes). **Não**
   substituir por `estimateTokens(composed)`.
5. Responder com métricas mescladas: campos 007 + `contextBreakdown` +
   `promptTokens` apenas se `number`.

## Compatibility

- Clientes que ignoram campos novos continuam válidos.
- Sem usage: chave `promptTokens` ausente; `contextBreakdown` ainda presente.
- Arena/bench/MCP não são obrigados a expor breakdown nesta feature.
- Erros HTTP existentes (400/404/422/504) inalterados.

## Test obligations (HTTP)

| Case | Expect |
|---|---|
| Stub com `promptTokens: N` | body.metrics.promptTokens === N |
| Stub sem promptTokens | chave ausente; breakdown presente |
| Memória + histórico + mensagem conhecidos | breakdown bate estimateTokens por fonte |
| Campos legados | historyMessages / memoryFacts / learningQueued intactos |
