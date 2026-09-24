---
description: "Tarefas de implementação da memória semântica do OpsPilot"
---

# Tasks: Memória semântica

**Input**: Design documents from `/specs/006-semantic-memory/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — a spec exige teste semântico sem palavras em comum (FR-011 / SC-001), contrato `:memory:` (SC-006) e a constituição exige teste com lógica nova.

**Organization**: Tasks agrupadas por user story; composição HTTP não acopla strategies ao memory store.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]…[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependência de embeddings e esqueleto `src/memory/` sem mudar comportamento de `/chat` ainda.

- [X] T001 Add `@huggingface/transformers` to `package.json` / lockfile via `npm install @huggingface/transformers`
- [X] T002 [P] Create `src/memory/` stubs: `embeddings.ts`, `memory-store.ts`, `sqlite-memory-store.ts`, `fake-memory-store.ts`, `memory-ranking.ts`, `memory-prompt.ts`, and `memory-store.test.ts` per `specs/006-semantic-memory/plan.md`
- [X] T003 [P] Ensure `.gitignore` ignores Transformers.js / Hugging Face local model caches (e.g. `.cache/`, `node_modules/.cache/`) without removing existing `data/*.db` rules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, ranking puro, formatação de prompt e métrica compartilhados por todas as stories.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T004 Define `RememberResult`, `RecalledMemory`, `MemoryStore` (`remember` / `recall` / `forget` / `close`), and embed DI type in `src/memory/memory-store.ts`
- [X] T005 [P] Add constants `DEDUP_THRESHOLD = 0.92`, `RECALL_MIN_SCORE = 0.3`, `RECALL_TOP_K = 3` plus pure `dotProduct` / `topkByScore` / `findDedupMatch` helpers in `src/memory/memory-ranking.ts`
- [X] T006 [P] Implement pure `formatMemoryBlock` (omit empty) in `src/memory/memory-prompt.ts` with unit coverage in `src/memory/memory-prompt.test.ts`
- [X] T007 [P] Extend `Metrics` with required `memoryFacts: number` in `src/agents/types.ts` and update existing metric fixtures/stubs (`src/agents/strategy.ts`, `src/http/server.test.ts`, `src/agents/reflection.test.ts`, `src/arena.test.ts`, and related) so typecheck stays green
- [X] T008 [P] Add unit tests for ranking/dedup edge cases (threshold boundaries, empty list, top-k cap) in `src/memory/memory-ranking.test.ts`

**Checkpoint**: Interface, helpers puros e métrica prontos; store/HTTP ainda não ligados.

---

## Phase 3: User Story 1 - Guardar e recuperar fatos por usuário (Priority: P1) 🎯 MVP

**Goal**: `SqliteMemoryStore` com `remember` / `recall` / `forget`, tabela `memories` e BLOB Float32; dedup e top-3 via ranking in-process.

**Independent Test**: `SqliteMemoryStore(":memory:", stubEmbed)` → remember → recall → forget; DDL idempotente; isolamento por `userId` — sem HTTP/LLM.

### Tests for User Story 1

- [X] T009 [P] [US1] Add failing `:memory:` tests for idempotent DDL of `memories` (`id`, `user_id`, `fact`, `embedding`, `created_at`), empty `recall` → `[]`, and `forget` no-op in `src/memory/memory-store.test.ts`
- [X] T010 [P] [US1] Add failing tests for dedup (`created: false` when score > 0.92), recall top-3 / min 0.3, user isolation, and empty-fact rejection using injectable stub `embed` in `src/memory/memory-store.test.ts`

### Implementation for User Story 1

- [X] T011 [US1] Implement `SqliteMemoryStore` constructor with `DatabaseSync`, `OPSPILOT_DB` / `./data/opspilot.db` / `:memory:`, inject `embed`, BLOB helpers (`vectorToBlob` / `blobToVector`), and idempotent DDL in `src/memory/sqlite-memory-store.ts`
- [X] T012 [US1] Implement `remember`, `recall`, `forget`, and `close` with prepared statements only (no SQL concatenation) in `src/memory/sqlite-memory-store.ts`
- [X] T013 [US1] Make T009–T010 pass against `SqliteMemoryStore(":memory:")` with stub embeddings in `src/memory/memory-store.test.ts`

**Checkpoint**: Persistência SQLite de memórias validada em `:memory:` com embed injetável.

---

## Phase 4: User Story 2 - Injetar memória no chat HTTP (Priority: P1)

**Goal**: `POST /chat` aceita `userId` opcional, executa `recall`, injeta fatos no prompt composto e reporta `metrics.memoryFacts`.

**Independent Test**: HTTP com `FakeMemoryStore` pré-carregado + strategy stub — POST com `userId` → input da strategy contém fatos e `memoryFacts >= 1`; sem `userId` → `memoryFacts === 0`.

### Tests for User Story 2

- [X] T014 [P] [US2] Add failing HTTP tests: with `userId` + preloaded facts → strategy input includes memory block and `memoryFacts` matches count; without `userId` → `memoryFacts === 0`; blank `userId` → 400 in `src/http/server.test.ts`
- [X] T015 [P] [US2] Add failing assertion that existing conversation / historyMessages behavior from 005 remains intact when `userId` is omitted in `src/http/server.test.ts`

### Implementation for User Story 2

- [X] T016 [US2] Implement minimal `FakeMemoryStore` (in-memory facts + scores or stub vectors) suitable for HTTP tests in `src/memory/fake-memory-store.ts`
- [X] T017 [US2] Extend `chatRequestSchema` with optional `userId`, inject `MemoryStore` into `createApp` / `runChat`, and merge `memoryFacts` into response metrics in `src/http/server.ts`
- [X] T018 [US2] Compose `formatMemoryBlock(facts)` before/with `composeStrategyInput` / `formatChatHistory` so strategies still receive a single string in `src/http/server.ts` (and update `src/http/chat-history.ts` only if a shared compose helper is cleaner)
- [X] T019 [US2] Update `src/index.ts` to construct `SqliteMemoryStore` (default `embed`), pass it to `createApp`, and `close()` on shutdown alongside ops/conversation stores
- [X] T020 [US2] Make T014–T015 pass using `FakeMemoryStore` and stub strategies in `src/http/server.test.ts`

**Checkpoint**: `/chat` enriquece o prompt com recall quando `userId` está presente.

---

## Phase 5: User Story 3 - Embeddings locais reutilizáveis (Priority: P2)

**Goal**: Lazy singleton `embed` com `Xenova/all-MiniLM-L6-v2`, pooling mean + normalize true; default do `SqliteMemoryStore`.

**Independent Test**: Duas chamadas reutilizam o mesmo pipeline; norma ~1; teste semântico café PT → coffee EN encontra o fato.

### Tests for User Story 3

- [X] T021 [P] [US3] Add failing tests for singleton identity / repeated `embed` reuse and L2 norm ≈ 1 in `src/memory/embeddings.test.ts`
- [X] T022 [P] [US3] Add failing mandatory semantic test: remember `"O usuário prefere café sem açúcar"` then recall `"How does he like his coffee?"` → fact in top-3 with score ≥ 0.3 in `src/memory/memory-store.test.ts` (allow longer timeout)

### Implementation for User Story 3

- [X] T023 [US3] Implement lazy singleton pipeline (`feature-extraction`, `Xenova/all-MiniLM-L6-v2`, `{ pooling: "mean", normalize: true }`) and `embed(text)` in `src/memory/embeddings.ts`
- [X] T024 [US3] Wire default `embed` from `src/memory/embeddings.ts` into `SqliteMemoryStore` construction paths used by production (`src/index.ts`) and the semantic test in `src/memory/memory-store.test.ts`
- [X] T025 [US3] Make T021–T022 pass; document first-run model download in test title/comments if needed

**Checkpoint**: Embeddings reais alimentam remember/recall; SC-001 verde.

---

## Phase 6: User Story 4 - Doubles e testes determinísticos (Priority: P2)

**Goal**: Paridade de contrato fake + `:memory:` (com stub embed), isolamento confirmado, suíte sem DB em arquivo.

**Independent Test**: Mesma fixture remember/recall/forget no fake e no SQLite `:memory:` (stub embed); nenhum `opspilot.db` criado pela suíte de memória.

### Tests for User Story 4

- [X] T026 [P] [US4] Add shared contract fixture runner exercising remember/dedup/recall/forget/isolation against `FakeMemoryStore` and `SqliteMemoryStore(":memory:")` with the same stub `embed` in `src/memory/memory-store.test.ts`
- [X] T027 [P] [US4] Assert memory-store contract tests do not create a filesystem database under `data/` in `src/memory/memory-store.test.ts`

### Implementation for User Story 4

- [X] T028 [US4] Align `FakeMemoryStore` API/behavior with the shared contract (dedup threshold, top-k, forget no-op) in `src/memory/fake-memory-store.ts`
- [X] T029 [US4] Make T026–T027 pass; ensure strategies remain free of `MemoryStore` imports (`src/agents/react.ts`, `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`)

**Checkpoint**: Doubles determinísticos + SQLite cobrem o contrato sem arquivo de DB.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação final alinhada ao quickstart e higiene do repo.

- [X] T030 [P] Verify `npm run typecheck` and `npm test` cover quickstart scenarios in `specs/006-semantic-memory/quickstart.md` (DDL, dedup, semantic, HTTP `userId`, legacy path)
- [X] T031 [P] Confirm prepared-statement-only access and no secret/` .env` reads in `src/memory/sqlite-memory-store.ts` and `src/memory/embeddings.ts`
- [X] T032 Update `data/example.ts` (if used as composition reference) to show optional `userId` + recall injection consistent with `src/http/server.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências — começar imediatamente
- **Foundational (Phase 2)**: Depende do Setup — **BLOQUEIA** todas as user stories
- **US1 (Phase 3)**: Após Foundational — MVP do store (embed stub)
- **US2 (Phase 4)**: Após Foundational; usa FakeMemoryStore (pode seguir US1 ou em paralelo se a interface T004 estiver estável)
- **US3 (Phase 5)**: Após US1 (precisa do `SqliteMemoryStore` para o teste semântico)
- **US4 (Phase 6)**: Após US2 fake mínimo + US1 SQLite (paridade de contrato)
- **Polish (Phase 7)**: Após stories desejadas

### User Story Dependencies

- **User Story 1 (P1)**: Após Phase 2 — sem dependência de outras stories
- **User Story 2 (P1)**: Após Phase 2 — integra `MemoryStore` na HTTP; independente via fake
- **User Story 3 (P2)**: Depende de US1 (store) para SC-001 com modelo real
- **User Story 4 (P2)**: Depende de US1 + fake da US2 para runner compartilhado

### Within Each User Story

- Testes que falham antes da implementação
- Tipos/helpers (Phase 2) antes do store
- Store antes do HTTP
- Embeddings reais (US3) antes de declarar SC-001 completo
- Story completa antes de avançar prioridade quando em sequência

### Parallel Opportunities

- T002 || T003 após T001 (ou T003 em paralelo com T001)
- T005 || T006 || T007 || T008 após T004 (T008 pode seguir T005)
- T009 || T010 (testes US1)
- T014 || T015 (testes US2)
- T021 || T022 (testes US3)
- T026 || T027 (testes US4)
- T030 || T031 no polish
- Com dois devs: após Phase 2, um em US1 e outro no fake/HTTP (US2) em paralelo

---

## Parallel Example: User Story 1

```bash
# Testes US1 em paralelo:
Task: "DDL + empty recall + forget no-op in src/memory/memory-store.test.ts"
Task: "Dedup / top-3 / isolation / empty fact in src/memory/memory-store.test.ts"

# Depois implementação sequencial no mesmo arquivo de store:
Task: "SqliteMemoryStore DDL + BLOB in src/memory/sqlite-memory-store.ts"
Task: "remember/recall/forget in src/memory/sqlite-memory-store.ts"
```

---

## Parallel Example: User Story 2

```bash
# Testes HTTP em paralelo:
Task: "userId + memoryFacts injection in src/http/server.test.ts"
Task: "legacy path without userId still green in src/http/server.test.ts"

# Implementação: fake → schema/server → compose → index → green
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (`SqliteMemoryStore` + stub embed)
4. **STOP and VALIDATE**: Contrato `:memory:` verde
5. Demo remember/recall/forget sem HTTP

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → store SQLite MVP
3. US2 → `/chat` + `userId` + `memoryFacts`
4. US3 → embeddings reais + teste café/coffee
5. US4 → paridade fake + `:memory:`
6. Polish → quickstart / typecheck / test verdes

### Parallel Team Strategy

1. Time fecha Setup + Foundational juntos
2. Dev A: US1 (SQLite store)
3. Dev B: US2 (fake + HTTP) em paralelo após T004
4. Depois US3 (embeddings) → US4 (contrato compartilhado)

---

## Notes

- [P] = arquivos diferentes / sem dependência incompleta
- Embed stub nos testes de contrato; modelo real só em T021–T025 (pode ser lento na 1ª run)
- Não acoplar `src/agents/*` ao `MemoryStore`
- Limiares fixos na v1: 0.92 / 0.3 / top-3
- Implementação concluída via `/speckit-implement`
