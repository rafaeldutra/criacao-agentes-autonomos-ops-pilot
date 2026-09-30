# Chat HTTP Contract (extensão sumarização de histórico)

Extende métricas 008 / learning 007 / conversa 005.

## Endpoint

`POST /chat`

### Request body

Inalterado.

### Success response `200`

Campos existentes +:

- `trace` pode incluir `{ type: "summarize", content: string }` quando o lote
  disparar **neste** turno (após appends).
- `metrics.historyMessages`: **0..8** (raw pré-append).
- `metrics.contextBreakdown` (008): inclui `summary` (estimativa chars/4 do
  bloco de resumo usado no compose; `0` se omitido).

## Composition

1. Validar body; resolver conversa.
2. `history = lastMessages(conversationId, 8)` (antes dos appends).
3. `summaryRecord = getSummary(...)`; `summaryBlock = formatSummaryBlock(...)`.
4. Recall memória (006) se `userId`.
5. `composed = summaryBlock + memoryBlock + formatChatHistory(history, message)`.
6. `contextBreakdown` com fontes `summary`, `memory`, `history`, `message`.
7. Append user → strategy.run → append assistant.
8. `maybeSummarizeAfterTurn(...)`; se resultado, prepend/append evento
   `summarize` ao `trace` retornado.
9. Responder 200; learning 007 permanece pós-json se aplicável.
10. Falha no passo 8: log; 200 ainda com answer; sem evento summarize; ponteiro
    intacto.

## Compatibility

- Clientes ignoram eventos de trace desconhecidos com segurança.
- Sem summarizer injetado: comportamento = janela 8 + resumo persistido se
  já existir (read-only); **ou** app default injeta summarizer real —
  testes injetam fake / no-op.
- Arena/bench/MCP não obrigados a wire summarizer.

## Test obligations (HTTP / compose)

| Case | Expect |
|---|---|
| ≤8 msgs, fake | summarizer calls = 0; sem evento summarize |
| popular até lote (total=16, covered=0) num turno | 1 call; evento summarize; covered=8 |
| turno intermediário | 0 calls; resumo inalterado |
| resumo persistido | input da strategy contém bloco de summary; historyMessages ≤ 8 |
| summarizer throw | 200; sem evento; covered inalterado |
