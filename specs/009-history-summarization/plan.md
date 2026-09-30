# Implementation Plan: Sumarização de histórico (pruning)

**Branch**: `009-history-summarization` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-history-summarization/spec.md`

## Summary

Pruning de histórico no `/chat`: janela raw de **8** mensagens; o que sai da
janela é condensado em lotes de **8** via `HistorySummarizer` injetável
(merge com resumo anterior, ~150 tokens, decisões/fatos/pendências), persistido
em `conversation_summaries` com ponteiro `covered_count`. Summarize **nunca** a
cada request — só quando o lote completa. Resumo entra no prompt; evento de
trace `summarize` no turno que dispara. Testes com fake store + fake summarizer.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: Express, Zod, `node:sqlite`/`DatabaseSync`, LangChain
(default summarizer), `node:test`/`tsx`; reutiliza `ConversationStore` (005) e
métricas de contexto (008)

**Storage**: SQLite — nova tabela `conversation_summaries` no mesmo DB/schema
do `SqliteConversationStore`; fake in-memory para testes

**Testing**: `node:test`; fake summarizer + `FakeConversationStore`; SQLite
`:memory:` para DDL/CRUD; sem LLM real no CI

**Target Platform**: Node.js 22 LTS (HTTP + stores locais)

**Project Type**: Serviço HTTP de raciocínio operacional com stores injetáveis

**Performance Goals**: Summarizer só em lote completo; caminho sem lote sem
chamada LLM extra; falha do summarize não vira 5xx do chat

**Constraints**: Janela 8 (substitui 12 no `/chat`); lote exatamente 8;
ponteiro só avança após persistência OK; um resumo por conversa; evento
`summarize` no trace; injeção explícita

**Scale/Scope**: Extensão do conversation store, módulo summarizer, ajuste de
`HISTORY_WINDOW`/composição HTTP, tipo de trace, opcionalmente
`contextBreakdown.summary`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — persistência no store; regra de lote/helpers
  puros; LLM no summarizer; composição no HTTP.
- **Validação na fronteira**: PASS — request `/chat` inalterado; roles/limites
  no store; saída do summarizer trim/min 1 antes de persistir.
- **Erros de domínio**: PASS — conversa inexistente → `CONVERSATION_NOT_FOUND`;
  falha summarize → log, sem 5xx, ponteiro intacto.
- **Funções puras**: PASS — elegibilidade de lote, formatação de bloco de
  resumo, cálculo de offsets são puros.
- **Teste obrigatório**: PASS — fakes cobrem SC-001–SC-007.
- **Segurança**: PASS — prompt do summarizer exclui segredos; sem `.env` novo.
- **Spec antes de código**: PASS — plano baseado em `009-history-summarization`.
- **Pequeno e reversível**: PASS — aditivo na store; mudança controlada
  12→8 no `/chat`.
- **Persistência local explícita**: PASS — `node:sqlite`, DDL idempotente,
  prepared statements.
- **Reprodutibilidade**: PASS — fake store/summarizer injetáveis.

*Post-design re-check*: PASS — contratos/data-model alinhados; sem novas
camadas injustificadas.

## Project Structure

### Documentation (this feature)

```text
specs/009-history-summarization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── conversation-summary-store.md
│   ├── history-summarizer.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── conversation-store.ts          # + summary types / methods
│   ├── sqlite-conversation-store.ts   # + conversation_summaries DDL/CRUD
│   ├── fake-conversation-store.ts     # + in-memory summary
│   └── conversation-store.test.ts     # schema + CRUD + lote helpers se couber
├── conversation/   # ou src/http/ / src/memory/ — ver research
│   ├── history-summarizer.ts          # porta, default LLM, fake fixture
│   ├── history-summarizer.test.ts
│   ├── summary-batch.ts               # pure: eligible batch / covered math
│   └── summary-prompt.ts              # formatSummaryBlock
├── agents/
│   ├── types.ts                       # TraceEvent + summarize
│   └── trace.ts                       # summarize(content)
├── http/
│   ├── chat-history.ts                # HISTORY_WINDOW = 8
│   ├── server.ts                      # compose summary + maybeSummarize pós-turno
│   └── server.test.ts
└── context/
    └── tokens.ts                      # opcional: summary no contextBreakdown
```

**Structure Decision**: Estender `ConversationStore` com API de resumo (mesma
fronteira 005, FK na mesma DB). Lógica de lote em funções puras. Summarizer
como porta injetável em `ChatServerOptions`. Composição HTTP: injeta resumo
existente **antes** do strategy; após append user/assistant, tenta lote e
anexa evento `summarize` ao trace se persistiu.

## Complexity Tracking

> Sem violações de constituição a justificar.

## Phase 0 — Research

Ver [research.md](./research.md).

## Phase 1 — Design

Ver [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md).
