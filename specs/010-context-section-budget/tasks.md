---
description: "Tarefas de implementaÃ§Ã£o do ContextBuilder com orÃ§amento por seÃ§Ã£o do OpsPilot"
---

# Tasks: ContextBuilder com orÃ§amento por seÃ§Ã£o

**Input**: Design documents from `/specs/010-context-section-budget/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md; features 005â€“009 no caminho de `/chat`

**Tests**: IncluÃ­dos â€” FR-009 / SC-001â€“SC-006 e User Story 3 exigem tetos baixos com ordem de corte correta; constituiÃ§Ã£o exige teste com lÃ³gica nova.

**Organization**: Tasks por user story; builder puro em `src/context/`; budgets injetÃ¡veis; HTTP sÃ³ orquestra.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependÃªncia incompleta)
- **[Story]**: [US1]â€¦[US3] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descriÃ§Ã£o

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de arquivos do plano sem mudar o comportamento de `/chat` ainda.

- [X] T001 Verify layout targets from `specs/010-context-section-budget/plan.md` (`src/context/tokens.ts`, `src/http/server.ts`, `src/http/chat-history.ts`, `src/conversation/summary-prompt.ts`, `src/memory/memory-prompt.ts`, `.env.example`)
- [X] T002 [P] Create stub files `src/context/context-builder.ts` and `src/context/context-builder.test.ts` ready for implementation per `specs/010-context-section-budget/contracts/context-builder.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos compartilhados, defaults e leitura de env â€” base para todas as stories.

**âš ï¸ CRITICAL**: Nenhuma user story comeÃ§a antes desta fase.

- [X] T003 Export `SectionBudget`, `ContextBuildInput`, `ContextBuildResult`, and `DEFAULT_SECTION_BUDGET` (`summary: 200`, `window: 1200`, `memories: 300`) from `src/context/context-builder.ts` per `specs/010-context-section-budget/data-model.md`
- [X] T004 Implement `loadSectionBudgets(env?)` in `src/context/context-builder.ts` (parse `CONTEXT_BUDGET_SUMMARY|WINDOW|MEMORIES`; invalid/missing â†’ defaults; never throw)
- [X] T005 [P] Add failing unit tests for `loadSectionBudgets` defaults and invalid env fallback (`{}`, `"abc"`, `"-1"`) in `src/context/context-builder.test.ts`
- [X] T006 Make T005 pass for `loadSectionBudgets` in `src/context/context-builder.ts` / `src/context/context-builder.test.ts`

**Checkpoint**: Tipos e budgets carregÃ¡veis; `buildContext` e HTTP ainda incompletos.

---

## Phase 3: User Story 1 - Montar o prompt de contexto com tetos por seÃ§Ã£o (Priority: P1) ðŸŽ¯ MVP

**Goal**: `buildContext` compÃµe system â†’ summary â†’ memories â†’ window â†’ message (seÃ§Ãµes vazias omitidas); `/chat` usa esse prompt para todas as strategies; breakdown/mÃ©tricas usam sections pÃ³s-compose.

**Independent Test**: Chamar `buildContext` com seÃ§Ãµes abaixo dos defaults â†’ prompt contÃ©m todas; system + message intactos; sem summary/memories â†’ omitidos; stub HTTP recebe `built.prompt`.

### Tests for User Story 1

- [X] T007 [P] [US1] Add failing tests: below-default budgets keep sections intact; empty summary/memories omitted; system + message appear intact in `src/context/context-builder.test.ts` per `specs/010-context-section-budget/contracts/context-builder.md`
- [X] T008 [P] [US1] Add failing HTTP assertion that strategy receives builder prompt and `contextBreakdown` matches post-compose sections in `src/http/server.test.ts` per `specs/010-context-section-budget/contracts/chat-http.md`

### Implementation for User Story 1

- [X] T009 [US1] Implement `buildContext(input, budget?)` composition (reuse `formatSummaryBlock`, `formatMemoryBlock`, `formatHistoryOnly`; order systemâ†’summaryâ†’memoryâ†’historyâ†’message; empty omit) in `src/context/context-builder.ts` â€” cutting may be no-op stubs that pass-through while under budget
- [X] T010 [US1] Wire `runChatTurn` in `src/http/server.ts` to call `buildContext` + `buildContextBreakdown(built.sections)`; pass `built.prompt` to `strategy.run`; set `historyMessages` / `memoryFacts` from `keptHistory` / `keptMemories`
- [X] T011 [US1] Make T007â€“T008 pass in `src/context/context-builder.test.ts` and `src/http/server.test.ts`

**Checkpoint**: Compose canÃ´nico no `/chat`; abaixo dos tetos â‰ˆ comportamento 009.

---

## Phase 4: User Story 2 - Respeitar orÃ§amentos e regras de corte (Priority: P1)

**Goal**: Aplicar tetos: janela drop oldest (Ãºltima intacta se sozinha > teto); memÃ³rias drop menor score (empate = menor Ã­ndice); resumo trunca raw pelo final; system/message intocÃ¡veis; budgets via env/`SectionBudget`.

**Independent Test**: Budgets baixos injetados â†’ kept/history/memories/summary obedecem Ã s regras; system/message byte-iguais; `loadSectionBudgets` com env custom muda o corte (SC-005).

### Tests for User Story 2

- [X] T012 [P] [US2] Add failing tests for window cut (drop oldest until â‰¤ budget; keep newest if alone over budget) in `src/context/context-builder.test.ts`
- [X] T013 [P] [US2] Add failing tests for memories cut (lowest score first; tie â†’ lower index; budget 0 â†’ empty) in `src/context/context-builder.test.ts`
- [X] T014 [P] [US2] Add failing tests for summary truncation (raw end trim until `estimateTokens(format) â‰¤ budget`; budget 0 â†’ omit) in `src/context/context-builder.test.ts`
- [X] T015 [P] [US2] Add failing HTTP tests with injected low window/memories budgets asserting reduced `historyMessages` / `memoryFacts` and prompt content in `src/http/server.test.ts`

### Implementation for User Story 2

- [X] T016 [US2] Implement window budgeting helper (drop oldest while `estimateTokens(formatHistoryOnly(kept)) > budget.window` and `kept.length > 1`) in `src/context/context-builder.ts`
- [X] T017 [US2] Implement memories budgeting helper (drop lowest score / stable index while format over budget) in `src/context/context-builder.ts`
- [X] T018 [US2] Implement summary budgeting helper (truncate raw end; re-`formatSummaryBlock`; respect budget 0) in `src/context/context-builder.ts`
- [X] T019 [US2] Ensure `buildContext` never mutates/truncates `system` or current `message`; integrate helpers into the compose path in `src/context/context-builder.ts`
- [X] T020 [US2] Inject `loadSectionBudgets(process.env)` (or test override) in `src/http/server.ts` composition path per `specs/010-context-section-budget/contracts/chat-http.md`
- [X] T021 [US2] Make T012â€“T015 pass in `src/context/context-builder.test.ts` and `src/http/server.test.ts`

**Checkpoint**: Regras de corte e knobs de env observÃ¡veis.

---

## Phase 5: User Story 3 - Testes com tetos baixos / ordem de corte (Priority: P1)

**Goal**: SuÃ­te explÃ­cita que trava a **ordem** de corte (SC-001â€“SC-003) e fecha typecheck/test verdes.

**Independent Test**: Fixtures A/B/C e scores 0.9/0.5/0.1 com tetos que sÃ³ cabem o topo; budgets 0 nas orÃ§Ã¡veis â†’ system+message intactos; `npm run test` + `npm run typecheck` verdes.

### Tests for User Story 3

- [X] T022 [P] [US3] Add failing SC-001 test: three ordered history messages + window budget fitting only newest â†’ oldest removed first in `src/context/context-builder.test.ts`
- [X] T023 [P] [US3] Add failing SC-002 test: scores 0.9/0.5/0.1 + memories budget fitting only 0.9 â†’ 0.1 dropped before 0.5 in `src/context/context-builder.test.ts`
- [X] T024 [P] [US3] Add failing SC-003 test: zero budgets on budgeted sections â†’ system and message character-identical in `src/context/context-builder.test.ts`
- [X] T025 [P] [US3] Add failing SC-005 test: same input, two different `SectionBudget` values â†’ different `kept*` / sections in `src/context/context-builder.test.ts`

### Implementation for User Story 3

- [X] T026 [US3] Make T022â€“T025 pass; adjust cut helpers in `src/context/context-builder.ts` only if order/edge cases still fail
- [X] T027 [US3] Run `npm run test` and `npm run typecheck`; fix any regressions in `src/context/context-builder.ts`, `src/http/server.ts`, and related tests

**Checkpoint**: Ordem de corte travada por teste; suÃ­te verde.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: DocumentaÃ§Ã£o operacional e validaÃ§Ã£o do quickstart.

- [X] T028 [P] Document `CONTEXT_BUDGET_SUMMARY=200`, `CONTEXT_BUDGET_WINDOW=1200`, `CONTEXT_BUDGET_MEMORIES=300` in `.env.example`
- [X] T029 [P] Align any remaining `contextBreakdown` / metrics expectations with post-budget sections in `src/http/server.test.ts`
- [X] T030 Run validation from `specs/010-context-section-budget/quickstart.md` (`npm run typecheck`, `npm test`) and confirm checklist outcomes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependÃªncias
- **Foundational (Phase 2)**: Depende do Setup â€” **bloqueia** todas as stories
- **US1 (Phase 3)**: Depende da Phase 2 â€” MVP
- **US2 (Phase 4)**: Depende da US1 (`buildContext` + wire HTTP)
- **US3 (Phase 5)**: Depende da US2 (algoritmos de corte); pode redigir testes em paralelo apÃ³s US2 iniciar
- **Polish (Phase 6)**: Depende das stories desejadas

### User Story Dependencies

- **US1 (P1)**: ApÃ³s Phase 2 â€” compose + HTTP
- **US2 (P1)**: ApÃ³s US1 â€” regras de corte + env
- **US3 (P1)**: ApÃ³s US2 â€” trava ordem de corte (SC-001â€“SC-005)

### Within Each User Story

- Testes falhando antes da implementaÃ§Ã£o
- Helpers de corte antes de integrar no compose (US2)
- HTTP depois do builder mÃ­nimo (US1)

### Parallel Opportunities

- T002 com revisÃ£o de T001
- T005 apÃ³s T004
- T007 âˆ¥ T008 (US1)
- T012 âˆ¥ T013 âˆ¥ T014 âˆ¥ T015 (US2 testes)
- T022 âˆ¥ T023 âˆ¥ T024 âˆ¥ T025 (US3 testes)
- T028 âˆ¥ T029 (Polish)

---

## Parallel Example: User Story 2

```bash
# Testes de corte em paralelo (mesmo arquivo de teste â€” sequenciar writes se conflitar):
Task: "Window cut tests in src/context/context-builder.test.ts"
Task: "Memories cut tests in src/context/context-builder.test.ts"
Task: "Summary truncate tests in src/context/context-builder.test.ts"
Task: "HTTP low-budget tests in src/http/server.test.ts"
```

> Nota: T012â€“T014 tocam o mesmo `context-builder.test.ts` â€” marcar [P] na intenÃ§Ã£o; na prÃ¡tica, um agente deve appendar casos em sequÃªncia ou em um Ãºnico edit.

---

## Parallel Example: User Story 3

```bash
Task: "SC-001 oldest-first window order in src/context/context-builder.test.ts"
Task: "SC-002 lowest-score-first memories in src/context/context-builder.test.ts"
Task: "SC-003 untouchable system/message in src/context/context-builder.test.ts"
Task: "SC-005 different budgets different kept in src/context/context-builder.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2
2. Phase 3 (US1): `buildContext` + wire `/chat`
3. **STOP**: validar compose abaixo dos defaults
4. Seguir para US2 (corte) â€” valor operacional principal

### Incremental Delivery

1. Setup + Foundational â†’ tipos/budgets
2. US1 â†’ compose canÃ´nico (MVP observÃ¡vel)
3. US2 â†’ orÃ§amento real
4. US3 â†’ ordem de corte travada
5. Polish â†’ `.env.example` + quickstart

### Parallel Team Strategy

1. Juntos: Setup + Foundational
2. Dev A: US1 compose/HTTP
3. Dev B (apÃ³s US1): US2 algoritmos (T016â€“T018 podem ser files/helpers sequenciais no mesmo mÃ³dulo)
4. Dev A/B: US3 asserts de ordem + typecheck

---

## Notes

- [P] = arquivos diferentes sem dependÃªncia incompleta; mesmo arquivo â†’ serializar
- Estimativa de tokens: sempre `estimateTokens` de `src/context/tokens.ts`
- Arena/bench/MCP fora do escopo mÃ­nimo
- NÃ£o redefinir janela raw 8 nem lote summarize (009)
- Commit por tarefa ou grupo lÃ³gico; validar em cada checkpoint

