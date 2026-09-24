---
description: "Tarefas de implementação do refletor de aprendizado do OpsPilot"
---

# Tasks: Refletor de aprendizado

**Input**: Design documents from `/specs/007-learning-reflector/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md; feature `006-semantic-memory` já implementada

**Tests**: Incluídos — FR-009 / SC-001–SC-007 exigem stubs de structured output, fire-and-forget, fixtures positivo/negativo e `forget_preference`; constituição exige teste com lógica nova.

**Organization**: Tasks agrupadas por user story; aprendizado pós-resposta na composição HTTP; strategies sem `remember` direto.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]…[US3] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de arquivos do plano sem mudar o comportamento de `/chat` ainda.

- [X] T001 Verify `src/memory/`, `src/agents/tools.ts`, `src/agents/index.ts`, `src/http/server.ts`, and `src/index.ts` match the layout in `specs/007-learning-reflector/plan.md`
- [X] T002 [P] Create stubs `src/memory/learning-reflector.ts`, `src/memory/learning-reflector.test.ts`, and `src/http/request-context.ts` ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema do veredito, contexto de `userId`, métrica e helpers compartilhados.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T003 Define `LearningVerdict`, Zod `learningVerdictSchema` (refine: `hasLearning` ⇒ `fact.trim()` min 1), and `LearningReflector` type in `src/memory/learning-reflector.ts`
- [X] T004 [P] Implement request `userId` context (`runWithUserId` / `getUserId` via AsyncLocalStorage or equivalent) in `src/http/request-context.ts` with unit coverage in `src/http/request-context.test.ts`
- [X] T005 [P] Extend `Metrics` with required `learningQueued: boolean` in `src/agents/types.ts` and update metric fixtures/stubs (`src/agents/strategy.ts`, `src/http/server.test.ts`, `src/agents/reflection.test.ts`, `src/arena.test.ts`, and related) so typecheck stays green
- [X] T006 [P] Add pure `shouldRemember(verdict: LearningVerdict): boolean` helper in `src/memory/learning-reflector.ts` with unit tests in `src/memory/learning-reflector.test.ts`

**Checkpoint**: Tipos, contexto de request e métrica prontos; schedule/HTTP/tool ainda não ligados.

---

## Phase 3: User Story 1 - Destilar fatos duráveis após o chat (Priority: P1) 🎯 MVP

**Goal**: `scheduleLearning` fire-and-forget + composição HTTP pós-`200` com `userId`; stub reflector dispara `remember` sem bloquear a resposta.

**Independent Test**: Stub `hasLearning=true` + `FakeMemoryStore` → após `/chat` com `userId`, `remember` é chamado 1×; retorno HTTP não espera `remember`; sem `userId` → nenhum `remember` e `learningQueued === false`.

### Tests for User Story 1

- [X] T007 [P] [US1] Add failing unit tests for `scheduleLearning`: positive remember once, `hasLearning=false` skips, invalid fact skips, errors call `onError` without throwing in `src/memory/learning-reflector.test.ts`
- [X] T008 [P] [US1] Add failing HTTP tests: with `userId` + stub reflector → `learningQueued === true` and `remember` eventually called; response returns before `remember` resolves; without `userId` → `learningQueued === false` and no `remember` in `src/http/server.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Implement `scheduleLearning` (void fire-and-forget: reflect → conditional `memories.remember`, `onError` default `console.error`) in `src/memory/learning-reflector.ts`
- [X] T010 [US1] Implement default `createLearningReflector(model)` using `withStructuredOutput(learningVerdictSchema)` and learning system prompt in `src/memory/learning-reflector.ts`
- [X] T011 [US1] Wire `ChatServerOptions.learningReflector?`, set request `userId` context around the turn, merge `learningQueued`, and call `scheduleLearning` after successful `200` JSON (no await) in `src/http/server.ts`
- [X] T012 [US1] Update `src/index.ts` to pass default `createLearningReflector(createOpenRouterModel())` into `createApp` alongside existing `memories`
- [X] T013 [US1] Make T007–T008 pass with injectable stub reflector and `FakeMemoryStore` in `src/memory/learning-reflector.test.ts` and `src/http/server.test.ts`

**Checkpoint**: Aprendizado assíncrono pós-resposta funciona com `userId`.

---

## Phase 4: User Story 2 - Esquecer preferência via ferramenta (Priority: P1)

**Goal**: Tool `forget_preference` (recall top-1 → `forget`) com `userId` do request context; disponível no registry quando `memories` está configurado.

**Independent Test**: Seed fato no fake; `runWithUserId` + invoke tool → recall posterior não inclui o fato; sem match / sem `userId` → mensagens claras.

### Tests for User Story 2

- [X] T014 [P] [US2] Add failing tool tests: forget matching preference, no-match message, missing `userId` message, missing memories message in `src/agents/tools.test.ts`
- [X] T015 [P] [US2] Add failing assertion that `forget_preference` is present on `createTools` when `memories` is provided in `src/agents/tools.test.ts`

### Implementation for User Story 2

- [X] T016 [US2] Extend `createTools` options with `memories?: MemoryStore` and `getUserId?: () => string | undefined`; implement `forget_preference` schema + behaviour per `specs/007-learning-reflector/contracts/forget-preference-tool.md` in `src/agents/tools.ts`
- [X] T017 [US2] Update `createAgentRegistry` in `src/agents/index.ts` to accept optional `memories` / `getUserId` and pass them to `createTools`
- [X] T018 [US2] Wire production `getUserId` from `src/http/request-context.ts` and `memories` into registry construction from `src/http/server.ts` and/or `src/index.ts` so tools see the same turn `userId`
- [X] T019 [US2] Make T014–T015 pass in `src/agents/tools.test.ts`

**Checkpoint**: Ciclo remember (US1) + forget_preference fechado.

---

## Phase 5: User Story 3 - Critérios explícitos do que é aprendível (Priority: P2)

**Goal**: Prompt/schema e fixtures documentadas: preferência durável / pedido pontual / segredo; Zod rejeita `hasLearning=true` com fact vazio.

**Independent Test**: Fixtures de stub + testes de schema; pelo menos 1 positivo e 2 negativos cobertos.

### Tests for User Story 3

- [X] T020 [P] [US3] Add failing schema tests: `hasLearning=true` + empty fact rejected; `hasLearning=false` + empty fact accepted in `src/memory/learning-reflector.test.ts`
- [X] T021 [P] [US3] Add failing fixture table tests mapping preference / one-shot / secret messages to expected `hasLearning` via stub reflector policy helpers (or documented stub map) in `src/memory/learning-reflector.test.ts`

### Implementation for User Story 3

- [X] T022 [US3] Finalize learning system prompt text (durable only; never one-shot; never secrets) exported/used by `createLearningReflector` in `src/memory/learning-reflector.ts`
- [X] T023 [US3] Export test fixture constants (example messages from contract) in `src/memory/learning-reflector.ts` or colocated test helpers and make T020–T021 pass in `src/memory/learning-reflector.test.ts`
- [X] T024 [US3] Confirm `src/agents/reflection.ts` remains unchanged in responsibility (quality critic only; no learning imports)

**Checkpoint**: Critérios de aprendizado testáveis e separados da reflection 002.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validação quickstart e higiene.

- [X] T025 [P] Verify `npm run typecheck` and `npm test` cover scenarios in `specs/007-learning-reflector/quickstart.md` (positive/negative learning, fire-and-forget, forget_preference, legacy without `userId`)
- [X] T026 [P] Confirm strategies (`src/agents/react.ts`, `src/agents/plan-and-execute.ts`) do not import `scheduleLearning` / call `remember` directly
- [X] T027 [P] Update `data/example.ts` with a short comment referencing post-response `scheduleLearning` + `forget_preference` alongside existing recall notes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências
- **Foundational (Phase 2)**: Depende do Setup — **BLOQUEIA** stories
- **US1 (Phase 3)**: Após Foundational — MVP aprendizado async
- **US2 (Phase 4)**: Após Foundational; idealmente após T004 (contexto); pode paralelizar com US1 após Phase 2
- **US3 (Phase 5)**: Após T003/T010 (schema + prompt base); refinamentos de critérios
- **Polish (Phase 6)**: Após stories desejadas

### User Story Dependencies

- **User Story 1 (P1)**: Após Phase 2 — schedule + HTTP
- **User Story 2 (P1)**: Após Phase 2 — tool + registry; usa mesmo `getUserId` / `memories`
- **User Story 3 (P2)**: Refina prompt/fixtures do reflector (US1); não bloqueia demo MVP se stubs já cobrem SC-001–003

### Within Each User Story

- Testes que falham antes da implementação
- Helpers/contexto (Phase 2) antes de HTTP/tools
- Schedule antes do wire HTTP
- Tool antes do wire registry/produção

### Parallel Opportunities

- T001 || T002
- T004 || T005 || T006 após T003
- T007 || T008 (testes US1)
- T014 || T015 (testes US2)
- T020 || T021 (testes US3)
- T025 || T026 || T027 (polish)
- Após Phase 2: Dev A em US1, Dev B em US2

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 (`scheduleLearning` + HTTP)
4. **STOP and VALIDATE**: SC-001/004/006 com stubs
5. Demo aprendizado pós-chat

### Incremental Delivery

1. Setup + Foundational
2. US1 → remember assíncrono
3. US2 → `forget_preference`
4. US3 → fixtures/prompt explícitos
5. Polish → quickstart verde

---

## Notes

- [P] = arquivos diferentes / sem dependência incompleta
- Stubs de `LearningReflector` obrigatórios no CI (sem LLM real)
- Não misturar com `withReflection` (002)
- `userId` nunca no schema de `forget_preference`
- Implementação concluída via `/speckit-implement`
