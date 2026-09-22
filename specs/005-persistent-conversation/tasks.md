---
description: "Tarefas de implementação da conversa persistente do OpsPilot"
---

# Tasks: Conversa persistente

**Input**: Design documents from `/specs/005-persistent-conversation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — a spec exige cobertura `:memory:` + fake (FR-014) e a constituição exige teste com lógica nova.

**Organization**: Tasks agrupadas por user story; composição HTTP não acopla strategies ao store.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]…[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar superfícies de código do plano sem mudar comportamento ainda.

- [X] T001 Verify `src/store/`, `src/http/server.ts`, `src/agents/types.ts`, and `src/index.ts` match the plan layout in `specs/005-persistent-conversation/plan.md`
- [X] T002 [P] Create empty stubs `src/store/conversation-store.ts`, `src/store/sqlite-conversation-store.ts`, `src/store/fake-conversation-store.ts`, `src/store/conversation-store.test.ts`, and `src/http/chat-history.ts` ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Contratos de domínio e métricas compartilhados por todas as stories.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T003 Define `ConversationMessage`, `MessageRole`, and `ConversationStore` (`create` / `append` / `lastMessages` / `exists` / `close`) in `src/store/conversation-store.ts`
- [X] T004 [P] Add `CONVERSATION_NOT_FOUND` (reuse or extend `DomainError` from `src/store/ops-store.ts`) for unknown conversation ids in `src/store/conversation-store.ts`
- [X] T005 [P] Extend `Metrics` with required `historyMessages: number` in `src/agents/types.ts` and update existing metric fixtures/tests that construct `Metrics` (`src/agents/metrics.test.ts`, `src/http/server.test.ts`, `src/agents/reflection.test.ts`, and related stubs) so typecheck stays green
- [X] T006 [P] Implement pure `formatChatHistory` (and `HISTORY_WINDOW = 12`) in `src/http/chat-history.ts` with unit coverage in `src/http/chat-history.test.ts`

**Checkpoint**: Interface, erro de domínio, métrica e helper de histórico prontos.

---

## Phase 3: User Story 1 - Persistir turnos de chat (Priority: P1) 🎯 MVP

**Goal**: `SqliteConversationStore` com `create` / `append` / `lastMessages` e DDL idempotente de `conversations` + `messages`.

**Independent Test**: `SqliteConversationStore(":memory:")` → create → append user/assistant → lastMessages; schema criado sem HTTP/LLM.

### Tests for User Story 1

- [X] T007 [P] [US1] Add failing `:memory:` tests for idempotent DDL of `conversations`/`messages`, `create`, `append`, chronological `lastMessages(limit)`, and empty-conversation `[]` in `src/store/conversation-store.test.ts`
- [X] T008 [P] [US1] Add failing tests for `append`/`lastMessages` on unknown id → `CONVERSATION_NOT_FOUND` and invalid role rejection in `src/store/conversation-store.test.ts`

### Implementation for User Story 1

- [X] T009 [US1] Implement `SqliteConversationStore` constructor with `DatabaseSync`, `OPSPILOT_DB` / `./data/opspilot.db` / `:memory:`, foreign keys, and idempotent DDL in `src/store/sqlite-conversation-store.ts`
- [X] T010 [US1] Implement `create`, `exists`, `append`, `lastMessages`, and `close` with prepared statements only in `src/store/sqlite-conversation-store.ts`
- [X] T011 [US1] Make T007–T008 pass against `SqliteConversationStore(":memory:")` in `src/store/conversation-store.test.ts`

**Checkpoint**: Persistência SQLite de conversas validada em `:memory:`.

---

## Phase 4: User Story 2 - Continuar o chat via HTTP (Priority: P1)

**Goal**: `POST /chat` aceita `conversationId` opcional, cria/continúa conversa, devolve o id; rejeita id desconhecido antes da strategy.

**Independent Test**: HTTP com store fake/stub strategy — POST sem id → captura id → POST com id → mesmo `conversationId`; id inválido → 404 sem chamar strategy.

### Tests for User Story 2

- [X] T012 [P] [US2] Add failing HTTP tests: omit `conversationId` → response includes new id; reuse id → same id echoed; unknown id → 404 before strategy; invalid body still 400 in `src/http/server.test.ts`
- [X] T013 [P] [US2] Add failing test that strategy is not invoked when `conversationId` is unknown (spy/stub) in `src/http/server.test.ts`

### Implementation for User Story 2

- [X] T014 [US2] Extend `chatRequestSchema` with optional `conversationId` and inject `ConversationStore` into `createApp` / `chatHandler` in `src/http/server.ts`
- [X] T015 [US2] Wire create-or-validate conversation, `append(user)` / `append(assistant)`, and include `conversationId` on 200 responses; map `CONVERSATION_NOT_FOUND` to 404 in `src/http/server.ts`
- [X] T016 [US2] Update `src/index.ts` to construct `SqliteConversationStore`, pass it to `createApp`, and close it on shutdown alongside the ops store
- [X] T017 [US2] Make T012–T013 pass using `FakeConversationStore` or a minimal in-test double and stub strategies in `src/http/server.test.ts`

**Checkpoint**: Continuidade HTTP funciona com id opcional e erros claros.

---

## Phase 5: User Story 3 - Injetar histórico recente no prompt (Priority: P2)

**Goal**: Composição carrega até 12 mensagens anteriores no prompt e reporta `metrics.historyMessages`.

**Independent Test**: Seed >12 mensagens no fake; stub strategy registra input; exatamente 12 no contexto e `historyMessages === 12`.

### Tests for User Story 3

- [X] T018 [P] [US3] Add failing composition tests for `historyMessages` 0 / 3 / 12 and that only the last 12 prior messages are formatted into the strategy input in `src/http/server.test.ts`
- [X] T019 [P] [US3] Add failing unit assertions that `formatChatHistory` orders oldest→newest and respects the window in `src/http/chat-history.test.ts`

### Implementation for User Story 3

- [X] T020 [US3] Before `strategy.run`, load `lastMessages(id, HISTORY_WINDOW)`, compose input via `formatChatHistory`, and merge `historyMessages` into response metrics in `src/http/server.ts`
- [X] T021 [US3] Ensure strategies remain free of `ConversationStore` imports (`src/agents/react.ts`, `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`)
- [X] T022 [US3] Make T018–T019 pass in `src/http/server.test.ts` and `src/http/chat-history.test.ts`

**Checkpoint**: Histórico influencia o prompt só via composição; métrica correta.

---

## Phase 6: User Story 4 - Verificar doubles do store (Priority: P2)

**Goal**: `FakeConversationStore` + paridade de contrato com SQLite `:memory:` sem arquivo de DB.

**Independent Test**: Mesma fixture create/append/lastMessages no fake e no `:memory:`; resultados equivalentes; sem `opspilot.db`.

### Tests for User Story 4

- [X] T023 [P] [US4] Add shared contract fixture runner exercising create/append/lastMessages/limit/empty against both implementations in `src/store/conversation-store.test.ts`
- [X] T024 [P] [US4] Assert contract tests do not create a filesystem database file under `data/` in `src/store/conversation-store.test.ts`

### Implementation for User Story 4

- [X] T025 [US4] Implement `FakeConversationStore` matching the `ConversationStore` contract in `src/store/fake-conversation-store.ts`
- [X] T026 [US4] Run the shared contract against `FakeConversationStore` and `SqliteConversationStore(":memory:")` and make T023–T024 pass in `src/store/conversation-store.test.ts`

**Checkpoint**: Doubles determinísticos cobrem o contrato completo.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação ponta a ponta e alinhamento dos artefatos.

- [X] T027 [P] Update `specs/005-persistent-conversation/quickstart.md` if final APIs or commands differ from the planned scenarios
- [X] T028 Run `npm run typecheck` and `npm test`; confirm existing `/chat` behaviors (400/422/504/reflect) remain green aside from additive `conversationId` / `historyMessages`
- [X] T029 Confirm FR/SC coverage against `specs/005-persistent-conversation/spec.md`, `contracts/conversation-store.md`, and `contracts/chat-http.md`; review SQLite code for bound parameters only in `src/store/sqlite-conversation-store.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Sem dependências.
- **Foundational (Phase 2)**: Depende de T001–T002; **bloqueia** todas as stories.
- **US1 (Phase 3)**: Depende da Phase 2; MVP de persistência SQLite.
- **US2 (Phase 4)**: Depende de US1 (store real) e idealmente do fake (T025) para testes HTTP — pode usar double mínimo até US4; implementação de produção usa SQLite.
- **US3 (Phase 5)**: Depende do caminho `/chat` de US2 e do helper T006.
- **US4 (Phase 6)**: Pode começar em paralelo com US1 após Phase 2 (fake não depende de SQLite); contrato compartilhado fecha após ambos.
- **Polish (Phase 7)**: Depende de US1–US4.

### User Story Dependencies

- **US1 (P1)**: Após Phase 2 — sem dependência de outras stories.
- **US2 (P1)**: Após US1 interface/SQLite (ou fake mínimo) — independentemente testável via HTTP stubs.
- **US3 (P2)**: Após US2 — testável com fake + stub strategy.
- **US4 (P2)**: Após Phase 2 — paralelo a US1; fecha paridade com SQLite.

### Within Each User Story

- Testes primeiro (falhando) → implementação → testes verdes
- Store/contrato antes de HTTP
- Composição de histórico depois do wiring básico de `/chat`

### Parallel Opportunities

```text
Phase 2: T004 || T005 || T006 (após T003)
US1:     T007 || T008
US2:     T012 || T013
US3:     T018 || T019
US4:     T023 || T024  (em paralelo com US1 após Phase 2)
Polish:  T027 || (depois T028 sequencial)
```

---

## Parallel Example: User Story 1

```bash
# Testes em paralelo:
Task: "T007 failing :memory: DDL/create/append/lastMessages in src/store/conversation-store.test.ts"
Task: "T008 failing unknown-id and invalid-role tests in src/store/conversation-store.test.ts"

# Depois implementação sequencial:
Task: "T009 SqliteConversationStore constructor/DDL in src/store/sqlite-conversation-store.ts"
Task: "T010 create/append/lastMessages/close in src/store/sqlite-conversation-store.ts"
Task: "T011 make US1 tests pass in src/store/conversation-store.test.ts"
```

---

## Parallel Example: User Story 4 alongside US1

```bash
# Após Phase 2, em paralelo com T009–T011:
Task: "T025 FakeConversationStore in src/store/fake-conversation-store.ts"
Task: "T023–T024 shared contract + no filesystem DB in src/store/conversation-store.test.ts"
Task: "T026 run contract on both doubles in src/store/conversation-store.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 (SQLite conversation store)
4. **STOP** — validar `:memory:` independentemente
5. Seguir US2 → US3 → US4

### Incremental Delivery

1. Setup + Foundational → base pronta
2. US1 → persistência durável (MVP)
3. US2 → continuidade HTTP
4. US3 → prompt com histórico + métrica
5. US4 → fake + paridade de contrato
6. Polish → typecheck/test/quickstart

### Suggested MVP scope

**US1 apenas** (ConversationStore SQLite + testes `:memory:`). Já entrega o núcleo da feature; HTTP/histórico vêm nas stories seguintes.

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta
- Não importar `ConversationStore` dentro das strategies
- Janela fixa `HISTORY_WINDOW = 12`
- Por turno persistir só `user` + `assistant` (não o trace de tools)
- Manter `npm run typecheck` e `npm test` verdes ao final de cada checkpoint
