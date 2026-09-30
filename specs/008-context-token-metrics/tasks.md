---
description: "Tarefas de implementação da instrumentação de medição de contexto do OpsPilot"
---

# Tasks: Instrumentação de medição de contexto

**Input**: Design documents from `/specs/008-context-token-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md; `/chat` com métricas 005–007 já existentes

**Tests**: Incluídos — FR-009 / SC-001–SC-006 e US4 exigem testes de `estimateTokens`, usage real e métricas HTTP; constituição exige teste com lógica nova.

**Organization**: Tasks agrupadas por user story; módulo puro em `src/context/`; breakdown no HTTP; `promptTokens` via strategies/mensagens LangChain.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]…[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de arquivos do plano sem mudar o comportamento de `/chat` ainda.

- [X] T001 Verify layout targets from `specs/008-context-token-metrics/plan.md` (`src/context/`, `src/agents/types.ts`, `src/agents/strategy.ts`, `src/http/server.ts`, `scripts/conversa-longa.sh`)
- [X] T002 [P] Create stub files `src/context/tokens.ts` and `src/context/tokens.test.ts` ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos de métricas estendidos e helper de histórico sem mensagem atual — base para todas as stories.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T003 Extend `Metrics` with optional `promptTokens?: number` and optional `contextBreakdown?: { memory: number; history: number; message: number }` in `src/agents/types.ts` and keep existing metric fixtures typecheck-green (`src/agents/strategy.ts`, `src/http/server.ts`, `src/http/server.test.ts`, `src/agents/reflection.test.ts`, `src/arena.test.ts`, and related stubs)
- [X] T004 [P] Add `formatHistoryOnly(history)` (or equivalent) in `src/http/chat-history.ts` that formats the window as `role: content` lines joined by `\n` **without** the current user message; cover in `src/http/chat-history.test.ts`
- [X] T005 [P] Export `ContextBreakdown` type (or re-export from tokens) consistent with `specs/008-context-token-metrics/data-model.md` for use by HTTP metrics merge

**Checkpoint**: Tipos e helper de histórico prontos; tokens/HTTP ainda sem instrumentação completa.

---

## Phase 3: User Story 1 - Estimar e ler uso de tokens (Priority: P1) 🎯 MVP

**Goal**: Módulo canônico `src/context/tokens.ts` com `estimateTokens` (chars/4) e leitura/soma de `usage_metadata.input_tokens`.

**Independent Test**: Unitários: `"abcdefghij"` → `2`; `""` → `0`; usage `{ input_tokens: 42 }` → `42`; sem usage → `undefined`; duas AI messages 10+5 → `15`.

### Tests for User Story 1

- [X] T006 [P] [US1] Add failing unit tests for `estimateTokens`, `promptTokensFromUsage`, `sumPromptTokensFromMessages`, and `buildContextBreakdown` per `specs/008-context-token-metrics/contracts/tokens.md` in `src/context/tokens.test.ts`

### Implementation for User Story 1

- [X] T007 [US1] Implement `estimateTokens`, `promptTokensFromUsage`, `sumPromptTokensFromMessages`, and `buildContextBreakdown` in `src/context/tokens.ts` per `specs/008-context-token-metrics/contracts/tokens.md` and `research.md`
- [X] T008 [US1] Make T006 pass in `src/context/tokens.test.ts`

**Checkpoint**: Módulo de tokens puro e testado; `/chat` ainda sem novos campos obrigatórios.

---

## Phase 4: User Story 2 - `promptTokens` real e `contextBreakdown` no `/chat` (Priority: P1)

**Goal**: Strategies propagam `promptTokens` real; HTTP sempre anexa `contextBreakdown` estimado por `memory`/`history`/`message`; nunca preenche `promptTokens` com estimativa.

**Independent Test**: HTTP stub com `promptTokens: N` → body igual a N; stub sem usage → chave omitida + breakdown presente; textos conhecidos → breakdown = chars/4 por fonte; métricas legadas intactas.

### Tests for User Story 2

- [X] T009 [P] [US2] Add failing unit tests that `metricsFromMessages` sets `promptTokens` from AI `usage_metadata` (and omits when absent) in `src/agents/metrics.test.ts`
- [X] T010 [P] [US2] Add failing HTTP tests for `promptTokens` present/omitted and `contextBreakdown` always present with correct per-source estimates in `src/http/server.test.ts` per `specs/008-context-token-metrics/contracts/chat-http.md`

### Implementation for User Story 2

- [X] T011 [US2] Update `metricsFromMessages` in `src/agents/strategy.ts` to include `promptTokens` via `sumPromptTokensFromMessages` when defined
- [X] T012 [US2] Propagate/sum `promptTokens` in Plan-and-Execute and reflection metric aggregation in `src/agents/plan-and-execute.ts` and `src/agents/reflection.ts` (undefined when no valid usage)
- [X] T013 [US2] In `src/http/server.ts` `runChat`, compute `memoryText` / `historyText` / `messageText`, merge `contextBreakdown: buildContextBreakdown(...)`, and pass through `promptTokens` only when `typeof === "number"` (never estimate into that field)
- [X] T014 [US2] Align `StrategyRunResult` / local metrics typing in `src/http/server.ts` with extended `Metrics`
- [X] T015 [US2] Make T009–T010 pass in `src/agents/metrics.test.ts` and `src/http/server.test.ts`

**Checkpoint**: `/chat` 200 expõe breakdown sempre e `promptTokens` só quando real.

---

## Phase 5: User Story 3 - Script imprime `promptTokens` por turno (Priority: P2)

**Goal**: `scripts/conversa-longa.sh` imprime `promptTokens` de `metrics` (ou `n/a`) em cada turno; estimativa local req/res alinhada a chars/4.

**Independent Test**: Com JSON de fixture contendo `metrics.promptTokens`, a linha do turno exibe o valor; sem campo → `n/a` sem abortar só por isso.

### Tests for User Story 3

- [X] T016 [P] [US3] Document or add a minimal assertion/check (comment block + sample `jq` expectations in script header, or a tiny fixture note in `specs/008-context-token-metrics/quickstart.md`) that turn output includes `promptTokens=` from `.metrics.promptTokens // "n/a"`

### Implementation for User Story 3

- [X] T017 [US3] Verify/align `scripts/conversa-longa.sh` to print `promptTokens` per turn via `jq -r '.metrics.promptTokens // "n/a"'`, keep local floor chars/4 estimates consistent with `estimateTokens`, and ensure the script is runnable as documented in `specs/008-context-token-metrics/quickstart.md`

**Checkpoint**: Demo de conversa longa observa `promptTokens` real por turno.

---

## Phase 6: User Story 4 - Cobertura automatizada da medição (Priority: P1)

**Goal**: Garantir que toda a instrumentação permanece verde em `npm run test` / `npm run typecheck` (SC-006).

**Independent Test**: `npm run test` e `npm run typecheck` passam; suíte inclui tokens + HTTP breakdown + metricsFromMessages.

### Tests / Validation for User Story 4

- [X] T018 [US4] Fill any remaining gaps for SC-001–SC-004 in `src/context/tokens.test.ts` and `src/http/server.test.ts` (empty sources → 0; legacy metrics unchanged)
- [X] T019 [US4] Run `npm run test` and `npm run typecheck` and fix regressions across touched files (`src/context/`, `src/agents/`, `src/http/`)

**Checkpoint**: Feature completa sob CI local oficial.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Alinhamento final com quickstart e limpeza.

- [X] T020 [P] Cross-check `specs/008-context-token-metrics/quickstart.md` scenarios against implemented behavior (omit vs estimate rules)
- [X] T021 Confirm arena/bench/MCP unchanged except type-compatible `Metrics` defaults where fixtures required updates
- [X] T022 Final `npm run test` + `npm run typecheck` green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências
- **Foundational (Phase 2)**: Depende do Setup — **bloqueia** todas as stories
- **US1 (Phase 3)**: Após Phase 2 — MVP do módulo de tokens
- **US2 (Phase 4)**: Após US1 (usa `buildContextBreakdown` / sum helpers)
- **US3 (Phase 5)**: Após US2 para demo útil; script pode ser alinhado em paralelo após contrato HTTP conhecido
- **US4 (Phase 6)**: Após US1–US2 (e idealmente US3)
- **Polish (Phase 7)**: Após stories desejadas

### User Story Dependencies

- **US1 (P1)**: Só Phase 2 — independente
- **US2 (P1)**: Depende de US1 (funções de tokens)
- **US3 (P2)**: Depende do contrato de métricas (US2) para valor real; parsing `n/a` testável com fixture
- **US4 (P1)**: Agrega cobertura de US1+US2

### Within Each User Story

- Testes falhando antes da implementação (TDD onde marcado)
- Puros/helpers antes de HTTP
- Strategies propagam usage antes ou junto do merge HTTP

### Parallel Opportunities

- T002 paralelo ao restante do setup de verificação
- T004 e T005 em paralelo na Phase 2 (após T003 ou com cuidado de tipos)
- T006 testes US1 sozinhos antes de T007
- T009 e T010 em paralelo na US2
- T016 documentação US3 paralela a ajustes finos do script T017
- T020 paralelo a T021 no polish

---

## Parallel Example: User Story 1

```bash
# Testes primeiro:
Task: "T006 failing unit tests in src/context/tokens.test.ts"

# Depois implementação:
Task: "T007 implement tokens.ts"
Task: "T008 make tokens.test.ts pass"
```

## Parallel Example: User Story 2

```bash
# Testes em paralelo (arquivos diferentes):
Task: "T009 failing metrics.test.ts"
Task: "T010 failing server.test.ts"

# Implementação sequencial por dependência de merge:
Task: "T011 metricsFromMessages"
Task: "T012 plan-and-execute + reflection"
Task: "T013–T014 server.ts"
Task: "T015 make tests pass"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1) — módulo `tokens.ts` testado
3. **STOP** e validar SC-001 / contrato tokens

### Incremental Delivery

1. Setup + Foundational
2. US1 → tokens canônicos
3. US2 → `/chat` observável (`promptTokens` + breakdown)
4. US3 → script de plantão
5. US4 + Polish → CI verde e quickstart ok

### Parallel Team Strategy

1. Time fecha Phase 1–2
2. Dev A: US1 → Dev B prepara testes HTTP US2
3. Após US1: US2 integração
4. Dev C: US3 script em paralelo assim que o shape de métricas estiver estável

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta
- `promptTokens` **nunca** vem de `estimateTokens` (FR-007)
- `contextBreakdown` sempre com chaves `memory`/`history`/`message` (0 se vazio)
- Arena/bench/MCP não precisam expor breakdown nesta feature
- Formato checklist validado: checkbox + ID + [P]? + [USn]? + caminho
