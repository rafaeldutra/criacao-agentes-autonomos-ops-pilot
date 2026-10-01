# Chat HTTP Contract (extensão ContextBuilder / orçamento)

Extende composição 009 / métricas 008 / conversa 005.

## Endpoint

`POST /chat`

### Request body

Inalterado.

### Success response `200`

Inalterado em schema. Semântica:

- `metrics.contextBreakdown`: estimativas chars/4 das seções **após** orçamento
  (`summary` / `memory` / `history` / `message` do `ContextBuildResult.sections`).
- `metrics.historyMessages`: contagem de mensagens **raw** que entraram na
  janela após o corte (`keptHistory.length`), ainda ∈ [0, 8].
- `metrics.memoryFacts`: contagem de fatos após o corte
  (`keptMemories.length`).

## Composition

1. Validar body; resolver conversa.
2. `history = lastMessages(conversationId, HISTORY_WINDOW)` (antes dos appends).
3. `summaryRecord = getSummary(...)`.
4. Recall memória (006) se `userId`.
5. `budget = loadSectionBudgets(process.env)` (ou budget injetado em testes).
6. `built = buildContext({ summary, memories: facts, history, message }, budget)`.
7. `contextBreakdown = buildContextBreakdown(built.sections)`.
8. Append user → `strategy.run(built.prompt)` → append assistant.
9. `maybeSummarizeAfterTurn(...)` (009) inalterado.
10. Responder 200; learning 007 inalterado.

## Compatibility

- Abaixo dos tetos default, o prompt permanece semanticamente equivalente ao
  compose 009 (summary + memory + history + message).
- Arena/bench/MCP não obrigados a usar o builder.
- Clientes HTTP não veem campos novos obrigatórios.

## Test obligations (HTTP / compose)

| Case | Expect |
|------|--------|
| Stub strategy + inputs abaixo dos tetos | `strategy` recebe prompt do builder; breakdown bate com sections |
| Budget de window baixo injetado | `historyMessages` reflete kept; mensagens antigas ausentes do prompt |
| Budget de memories baixo | `memoryFacts` reflete kept; menor score ausente |
| Sem summary / sem userId | sections vazias omitidas; 200 OK |
