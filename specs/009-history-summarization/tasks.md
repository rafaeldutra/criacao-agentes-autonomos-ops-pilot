---
description: "Tarefas de implementação da sumarização de histórico (pruning) do OpsPilot"
---

# Tasks: Sumarização de histórico (pruning)

**Input**: Design documents from `/specs/009-history-summarization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md; features 005–008 no caminho de `/chat`

**Tests**: Incluídos — FR-008 / SC-001–SC-007 exigem fake store + fake summarizer, regra de lote, merge, compose e evento `summarize`; constituição exige teste com lógica nova.

**Organization**: Tasks por user story; persistência no store; lote puro + summarizer injetável; HTTP compõe resumo e resume após o turno.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]…[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de arquivos do plano sem mudar o comportamento de `/chat` ainda.

- [X] T001 Verify layout targets from `specs/009-history-summarization/plan.md` (`src/store/`, `src/conversation/`, `src/agents/types.ts`, `src/http/chat-history.ts`, `src/http/server.ts`)
- [X] T002 [P] Create stub files `src/conversation/summary-batch.ts`, `src/conversation/summary-prompt.ts`, `src/conversation/history-summarizer.ts`, `src/conversation/history-summarizer.test.ts`, and `src/conversation/summary-batch.test.ts` ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos compartilhados, janela 8, evento `summarize` e API de store — base para todas as stories.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T003 Extend `ConversationStore` with `ConversationSummaryRecord`, `getSummary`, `upsertSummary`, `messageCount`, and `messagesAscending` in `src/store/conversation-store.ts` per `specs/009-history-summarization/contracts/conversation-summary-store.md`
- [X] T004 [P] Add `TraceEvent` variant `{ type: "summarize"; content: string }` in `src/agents/types.ts` and helper `summarize(content)` in `src/agents/trace.ts` (update `formatTrace` if needed)
- [X] T005 [P] Set `HISTORY_WINDOW = 8` in `src/http/chat-history.ts` and update assertions in `src/http/chat-history.test.ts` and `src/http/server.test.ts` that expected 12
- [X] T006 [P] Extend `ContextBreakdown` / `buildContextBreakdown` with `summary: number` in `src/context/tokens.ts` and `src/agents/types.ts`; update `src/context/tokens.test.ts` and HTTP metrics expectations

**Checkpoint**: Tipos, janela 8 e contrato de store tipado; CRUD/summarizer/HTTP ainda incompletos.

---

## Phase 3: User Story 1 - Persistir resumo por conversa (Priority: P1) 🎯 MVP

**Goal**: Tabela `conversation_summaries` + CRUD em SQLite e fake; um resumo por conversa com `coveredCount`.

**Independent Test**: `:memory:` e fake — upsert/get round-trip; segundo upsert sobrescreve; id desconhecido → `CONVERSATION_NOT_FOUND`; DDL idempotente.

### Tests for User Story 1

- [X] T007 [P] [US1] Add failing store tests for `conversation_summaries` DDL, upsert/get, overwrite, unknown id, `messageCount`, and `messagesAscending` in `src/store/conversation-store.test.ts` per `specs/009-history-summarization/contracts/conversation-summary-store.md`

### Implementation for User Story 1

- [X] T008 [US1] Implement DDL + `getSummary` / `upsertSummary` / `messageCount` / `messagesAscending` in `src/store/sqlite-conversation-store.ts`
- [X] T009 [US1] Implement the same summary API in `src/store/fake-conversation-store.ts`
- [X] T010 [US1] Make T007 pass for both Sqlite `:memory:` and Fake in `src/store/conversation-store.test.ts`

**Checkpoint**: Persistência de resumo testável sem summarizer/HTTP.

---

## Phase 4: User Story 2 - Pruning em lotes de 8 (Priority: P1)

**Goal**: `selectSummaryBatch` + `maybeSummarizeAfterTurn` — summarizer só quando há ≥8 mensagens descobertas fora da janela; ponteiro só avança após upsert OK.

**Independent Test**: Funções puras + orquestração com fake: total≤8 → 0 calls; total=16 covered=0 → 1 call e covered=8; total=15 → 0 calls; falha do summarizer → covered intacto.

### Tests for User Story 2

- [X] T011 [P] [US2] Add failing unit tests for `selectSummaryBatch` edge cases (≤8, 15, 16, covered=8/total=24) in `src/conversation/summary-batch.test.ts`
- [X] T012 [P] [US2] Add failing tests for `maybeSummarizeAfterTurn`: no-op, one batch, no advance on summarizer throw in `src/conversation/history-summarizer.test.ts`

### Implementation for User Story 2

- [X] T013 [US2] Implement `selectSummaryBatch` / `SUMMARY_BATCH_SIZE` in `src/conversation/summary-batch.ts` per `specs/009-history-summarization/contracts/history-summarizer.md`
- [X] T014 [US2] Implement `maybeSummarizeAfterTurn` (select → load batch → summarizer → upsert → return summarize event; onError/log on failure) in `src/conversation/history-summarizer.ts`
- [X] T015 [US2] Make T011–T012 pass using `FakeConversationStore` and a call-counting fake summarizer in `src/conversation/summary-batch.test.ts` and `src/conversation/history-summarizer.test.ts`

**Checkpoint**: Regra de lote e ponteiro corretos sem LLM real.

---

## Phase 5: User Story 3 - Resumo ~150 tokens / merge (Priority: P1)

**Goal**: Porta `HistorySummarizer`, prompt default (decisões/fatos/pendências, ~150 tokens, sem segredos), fake determinístico e `createHistorySummarizer` LLM.

**Independent Test**: Fake recebe `previousSummary` + batch de 8 e devolve merge; default prompt contém critérios; testes sem OpenRouter.

### Tests for User Story 3

- [X] T016 [P] [US3] Add failing tests that fake summarizer is invoked with previous summary + batch contents and persisted merge text in `src/conversation/history-summarizer.test.ts`

### Implementation for User Story 3

- [X] T017 [US3] Define `HistorySummarizer` type, `SUMMARY_SYSTEM_PROMPT`, `createHistorySummarizer(model)`, and `createFakeHistorySummarizer` (or fixture) in `src/conversation/history-summarizer.ts`
- [X] T018 [US3] Make T016 pass; assert prompt text covers decisions/facts/pending/~150 tokens/no secrets in `src/conversation/history-summarizer.test.ts`

**Checkpoint**: Merge testável com fake; default LLM disponível para wire de produção.

---

## Phase 6: User Story 4 - Resumo no contexto + evento `summarize` (Priority: P2)

**Goal**: Bloco de resumo no compose do `/chat`; `maybeSummarizeAfterTurn` pós-appends; evento no trace; `contextBreakdown.summary`; `historyMessages` 0..8.

**Independent Test**: HTTP com fake — input da strategy contém summary; disparo de lote → 1 evento `summarize`; sem lote → sem evento; summarizer throw → 200 sem evento.

### Tests for User Story 4

- [X] T019 [P] [US4] Add failing HTTP tests: summary in strategy input; batch trigger adds `summarize` trace event; incomplete batch no event; summarizer failure still 200 in `src/http/server.test.ts` per `specs/009-history-summarization/contracts/chat-http.md`

### Implementation for User Story 4

- [X] T020 [US4] Implement `formatSummaryBlock` in `src/conversation/summary-prompt.ts` with unit coverage in `src/conversation/summary-prompt.test.ts` (or `history-summarizer.test.ts`)
- [X] T021 [US4] Wire `ChatServerOptions.historySummarizer?`, compose `summaryBlock + memory + history`, `contextBreakdown.summary`, and post-turn `maybeSummarizeAfterTurn` merging summarize into `trace` in `src/http/server.ts`
- [X] T022 [US4] Wire default `createHistorySummarizer(createOpenRouterModel())` in `src/index.ts` when composing `createApp`
- [X] T023 [US4] Make T019 pass with injectable fake summarizer and `FakeConversationStore` in `src/http/server.test.ts`

**Checkpoint**: `/chat` observa pruning no contexto e no trace.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Consistência com quickstart e regressões 005–008.

- [X] T024 [P] Align remaining tests that hard-coded history window 12 or old `contextBreakdown` shape across `src/**/*.test.ts`
- [X] T025 [P] Cross-check `specs/009-history-summarization/quickstart.md` scenarios against implemented behavior
- [X] T026 Run `npm run test` and `npm run typecheck` and fix regressions

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências
- **Foundational (Phase 2)**: Depende do Setup — **bloqueia** stories
- **US1 (Phase 3)**: Após Phase 2 — MVP persistência
- **US2 (Phase 4)**: Após US1 (precisa API do store)
- **US3 (Phase 5)**: Pode sobrepor parcialmente US2; precisa tipos do summarizer usados por `maybeSummarizeAfterTurn` (T014 pode usar stub type até T017)
- **US4 (Phase 6)**: Após US1–US3 (compose + orquestração)
- **Polish (Phase 7)**: Após stories desejadas

### User Story Dependencies

- **US1 (P1)**: Só Phase 2
- **US2 (P1)**: Depende de US1
- **US3 (P1)**: Porta/prompt; integrado a US2 orquestração
- **US4 (P2)**: Depende de US1–US3

### Within Each User Story

- Testes falhando antes da implementação
- Store/API antes de orquestração
- Orquestração antes de HTTP

### Parallel Opportunities

- T002 stubs em paralelo
- T004, T005, T006 em paralelo após T003 (ou com cuidado de tipos)
- T007 testes US1 sozinhos
- T011 ∥ T012 na US2
- T019 testes HTTP após contratos estáveis
- T024 ∥ T025 no polish

---

## Parallel Example: User Story 1

```bash
Task: "T007 failing store tests in src/store/conversation-store.test.ts"
Task: "T008 sqlite-conversation-store.ts"
Task: "T009 fake-conversation-store.ts"
Task: "T010 make store tests pass"
```

## Parallel Example: User Story 2

```bash
Task: "T011 failing summary-batch.test.ts"
Task: "T012 failing history-summarizer.test.ts (maybeSummarizeAfterTurn)"
# then
Task: "T013–T015 implement and green"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1) — `conversation_summaries` CRUD
3. **STOP** e validar contrato de store

### Incremental Delivery

1. Setup + Foundational
2. US1 → persistência
3. US2 → regra de lote
4. US3 → summarizer fake/default
5. US4 → `/chat` + trace + breakdown
6. Polish → CI verde

### Parallel Team Strategy

1. Time fecha Phase 1–2
2. Dev A: US1 store → Dev B: summary-batch puros (US2)
3. Após US1: US2 orquestração + US3 prompt/fake
4. US4 HTTP integração

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta
- Summarizer **nunca** a cada request — só lote completo
- Ponteiro só avança após `upsertSummary` OK
- `historyMessages` = raw 0..8 (não tamanho do resumo)
- Formato checklist validado: checkbox + ID + [P]? + [USn]? + caminho
