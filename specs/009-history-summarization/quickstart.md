# Sumarização de histórico: Quickstart

## Prerequisites

- Features 005–008 no ar (conversa, memória, learning, métricas de tokens).
- Node.js 22 LTS; dependências instaladas.
- Testes usam `FakeConversationStore` + `HistorySummarizer` fake (sem
  OpenRouter obrigatório).

## Validação determinística

```powershell
npm run typecheck
npm test
```

A suíte deve cobrir:

1. DDL/CRUD `conversation_summaries` em `:memory:` + fake
   ([conversation-summary-store.md](./contracts/conversation-summary-store.md)).
2. `selectSummaryBatch` — elegível só com ≥8 descobertas fora da janela
   ([history-summarizer.md](./contracts/history-summarizer.md)).
3. `maybeSummarizeAfterTurn` / HTTP: 0 calls com total≤8; 1 call ao completar
   lote; merge com resumo anterior (SC-001–SC-004).
4. Compose: bloco de summary no input; `historyMessages` ∈ [0,8]; evento
   `summarize` só no turno de disparo (SC-005–SC-006)
   ([chat-http.md](./contracts/chat-http.md)).
5. Falha do fake summarizer não vira 5xx; ponteiro intacto.

## Smoke HTTP local (opcional)

```powershell
npm run dev
```

Rodar ~9 turnos no mesmo `conversationId` (18 mensagens user+assistant) e
inspecionar quando `trace` ganha `summarize` e se turnos seguintes incluem
`[Conversation summary]` no comportamento do agente. Com
`scripts/conversa-longa.sh`, observar `promptTokens` / breakdown após pruning.

## Security checks

- Prompt do summarizer exclui segredos.
- Sem schema montado por concatenação de input.
- Upsert só com `conversationId` já existente.
