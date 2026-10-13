---
description: "Tarefas de implementação da resiliência e fallback de modelos do OpsPilot"
---

# Tasks: Resiliência e Fallback de Modelos

**Input**: Design documents from `/specs/012-model-fallback-resilience/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-012 exige testes determinísticos sem rede (sucesso primário, retry, fallback com evento/métrica, 503); constituição V exige teste com lógica nova.

**Organization**: Tasks por user story; resiliência em `src/agents/model.ts`; rastreio por turno em `src/agents/model-usage.ts`; tradução HTTP em `src/http/server.ts`. Testes injetam `BaseChatModel` dublês em `createResilientModel` — nunca chamam `createOpenRouterModel`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]–[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar alvos e preparar dublês de teste, sem mudar comportamento.

- [X] T001 Verify layout targets from `specs/012-model-fallback-resilience/plan.md` (`src/agents/model.ts`, `src/agents/types.ts`, `src/agents/trace.ts`, `src/agents/react.ts`, `src/agents/production-graph.ts`, `src/http/server.ts`) and that `npm run test` / `npm run typecheck` are green on the branch baseline
- [X] T002 [P] Create test helper `src/agents/test-models.ts` exporting a scripted `BaseChatModel` double (built on `FakeListChatModel` from `@langchain/core/utils/testing` or a minimal subclass) that fails the first N calls with an `Error` carrying `status`, then answers; supports `bindTools`/`withStructuredOutput` and counts invocations

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos, escopo por turno e a nova superfície `ResilientModel` (ainda pass-through) com todos os consumidores compilando.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T003 Extend `TraceEvent` with variant `{ type: "fallback"; fromModel: string; toModel: string; reason: string; node?: GraphNode }` and `Metrics` with `modelUsed?: string` in `src/agents/types.ts` per `specs/012-model-fallback-resilience/data-model.md`
- [X] T004 [P] Add pure `fallback(fromModel, toModel, reason)` helper and `formatTrace` branch `[fallback@<node>] <from> -> <to> (<reason>)` in `src/agents/trace.ts`, with tests in `src/agents/trace.test.ts`
- [X] T005 [P] Create `src/agents/model-usage.ts` (`runWithModelUsage`, `recordModelUsed`, `recordFallback`, `drainFallbacks`, `FallbackRecord`) on `AsyncLocalStorage` mirroring `src/http/request-context.ts`, per `specs/012-model-fallback-resilience/contracts/model-resilience.md`
- [X] T006 [P] Add tests in `src/agents/model-usage.test.ts`: record calls are no-op outside a scope; `runWithModelUsage` returns last `modelUsed`; `drainFallbacks` returns and clears; two concurrent scopes (`Promise.all`) stay isolated
- [X] T007 Define `ResilientModel` type and `createResilientModel({ primary, fallback, primaryModel, fallbackModel, retry })` in `src/agents/model.ts` as pass-through to `primary` for `invoke`, `bindTools(tools)`, `withStructuredOutput(schema)`; make `createOpenRouterModel()` return it (two `ChatOpenAI` with `temperature: 0`, `maxRetries: 0`, same `apiKey`/`baseURL`, fallback id from `OPENROUTER_MODEL_FALLBACK`)
- [X] T008 Switch `createReactAgent` to dynamic model `llm: () => model.bindTools(Object.values(tools))` in `src/agents/react.ts` (static `llm` rejects `RunnableWithFallbacks`, see research.md)
- [X] T009 Fix type-only fallout of `ReturnType<typeof createOpenRouterModel>` in `src/agents/plan-and-execute.ts`, `src/agents/reflection.ts`, `src/agents/production-graph.ts`, `src/memory/learning-reflector.ts`, `src/conversation/history-summarizer.ts`, `src/arena.ts`, `src/bench.ts`; update any test fakes passed as `model` so `npm run typecheck` and `npm run test` are green

**Checkpoint**: Nova superfície de modelo em uso por todos os consumidores; comportamento idêntico ao anterior (só primário, sem retry).

---

## Phase 3: User Story 1 - Execução primária com retentativa transparente (Priority: P1) 🎯 MVP

**Goal**: Falhas transitórias do primário são retentadas (3 tentativas no total); `metrics.modelUsed` reporta o primário; nenhum evento `fallback`.

**Independent Test**: Dublê primário falha 1× com `status: 503` e depois responde → resposta entregue, `modelUsed = primaryModel`, reserva com 0 chamadas, trace sem `fallback`.

### Tests for User Story 1

- [X] T010 [P] [US1] Add failing tests in `src/agents/model.test.ts`: healthy primary answers on `invoke`, `bindTools`, `withStructuredOutput` and records `modelUsed = primaryModel` inside `runWithModelUsage`; primary failing once with 503 then succeeding uses 2 attempts and 0 fallback calls; `retry.stopAfterAttempt` respected (use low value to keep backoff short)
- [X] T011 [P] [US1] Add failing test in `src/agents/production-graph.test.ts`: strategy stub that calls an injected `ResilientModel` yields `metrics.modelUsed = primaryModel` and no `fallback` event; with stubs that make no model call, `modelUsed` is absent

### Implementation for User Story 1

- [X] T012 [US1] Implement retry in `src/agents/model.ts`: wrap each derived primary runnable with `withRetry({ stopAfterAttempt: retry.stopAfterAttempt ?? 3, onFailedAttempt })` and call `recordModelUsed(primaryModel)` on success
- [X] T013 [US1] Wrap `graph.invoke` in `runWithModelUsage` inside `runProductionGraph` and add `modelUsed` to `metrics` when defined in `src/agents/production-graph.ts`
- [X] T014 [US1] Ensure `runChat` keeps `metrics.modelUsed` in the `/chat` response (it rides on `baseMetrics`) and add a 200 assertion for it in `src/http/server.test.ts` per `specs/012-model-fallback-resilience/contracts/chat-http.md`
- [X] T015 [US1] Make T010–T011 pass in `src/agents/model.ts`, `src/agents/model.test.ts`, `src/agents/production-graph.test.ts`

**Checkpoint**: Retry transparente no primário; `modelUsed` visível no `/chat`.

---

## Phase 4: User Story 2 - Comutação para modelo reserva com rastreio de fallback (Priority: P1)

**Goal**: Primário esgotado ou com erro não retentável → reserva com a mesma derivação; evento `fallback` com `node` no trace; `modelUsed = fallbackModel`; turno seguinte volta ao primário.

**Independent Test**: Primário sempre falha, reserva saudável → 200, trace com `{ type: "fallback", fromModel, toModel, reason, node }`, `modelUsed = fallbackModel`; próxima chamada com primário saudável → sem `fallback`.

### Tests for User Story 2

- [X] T016 [P] [US2] Add failing tests in `src/agents/model.test.ts`: primary exhausted → fallback answers and `recordFallback` gets `{ fromModel, toModel, reason }` with sanitized reason (`<status> <first line>`, ≤ 200 chars, no stack); primary 401 → 1 primary attempt only, then fallback; `bindTools` tools and `withStructuredOutput` schema reach the fallback double
- [X] T017 [P] [US2] Add failing tests in `src/agents/production-graph.test.ts`: fallback during a strategy node yields a `fallback` event with that route as `node` placed before the strategy events, and `metrics.modelUsed = fallbackModel`; a second `runProductionGraph` with healthy primary has no `fallback` and `modelUsed = primaryModel`
- [X] T018 [P] [US2] Add failing case for router-node fallback (`node: "router"`) in `src/agents/production-graph.test.ts` using `createDefaultDecideRoute` with an injected `ResilientModel`

### Implementation for User Story 2

- [X] T019 [US2] Add pure helpers `isRetryableModelError(error)` (abort on `status ∈ {400,401,403,404,422}`) and `fallbackReason(error)` in `src/agents/model.ts`; throw from `onFailedAttempt` for non-retryable errors and keep the last primary error for the reason
- [X] T020 [US2] Compose `primaryRetry.withFallbacks([fallbackDerived])` for `invoke`/`bindTools`/`withStructuredOutput`, where the fallback branch calls `recordFallback` then `recordModelUsed(fallbackModel)` on success, in `src/agents/model.ts` per `specs/012-model-fallback-resilience/contracts/model-resilience.md`
- [X] T021 [US2] In `src/agents/production-graph.ts`, call `drainFallbacks()` at the end of `routerNode` and `runStrategy` nodes and prepend the drained records as `fallback()` events stamped with the node
- [X] T022 [US2] Make T016–T018 pass in `src/agents/model.ts`, `src/agents/model.test.ts`, `src/agents/production-graph.ts`, `src/agents/production-graph.test.ts`

**Checkpoint**: Contingência automática, auditável no trace e nas métricas, sem estado degradado entre turnos.

---

## Phase 5: User Story 3 - Degradação graciosa com HTTP 503 em falha total (Priority: P1)

**Goal**: Primário e reserva falham → `ModelUnavailableError` atravessa o grafo → `/chat` responde 503 `{ error, code: "MODEL_SERVICE_UNAVAILABLE" }` sem stack; 504 continua tendo precedência.

**Independent Test**: Ambos os dublês falham → `POST /chat` retorna 503 com corpo exato do contrato; roteador não converte em 502.

### Tests for User Story 3

- [X] T023 [P] [US3] Add failing test in `src/agents/model.test.ts`: both models fail → rejects with `ModelUnavailableError` (`code: "MODEL_SERVICE_UNAVAILABLE"`, `cause` = primary error) on `invoke`, `bindTools` and `withStructuredOutput` runnables
- [X] T024 [P] [US3] Add failing test in `src/agents/production-graph.test.ts`: `decideRoute` rejecting with `ModelUnavailableError` propagates as-is (not `RouterError`); same for a strategy node
- [X] T025 [P] [US3] Add failing tests in `src/http/server.test.ts`: strategy/decideRoute throwing `ModelUnavailableError` → 503 body `{ error: "Language model service unavailable", code: "MODEL_SERVICE_UNAVAILABLE" }` with no `stack`/provider text; slow failure beyond `timeoutMs` still → 504; no assistant message appended

### Implementation for User Story 3

- [X] T026 [US3] Add `MODEL_SERVICE_UNAVAILABLE` and `ModelUnavailableError extends DomainError` (fixed message, `cause`) in `src/agents/model.ts`; translate the final `withFallbacks` rejection into it
- [X] T027 [US3] Rethrow `ModelUnavailableError` unchanged in `routerNode` catch in `src/agents/production-graph.ts`
- [X] T028 [US3] Add `isModelUnavailable` and map it to 503 in `chatHandler` after `isTimeout` in `src/http/server.ts`
- [X] T029 [US3] Make T023–T025 pass in `src/agents/model.ts`, `src/agents/production-graph.ts`, `src/http/server.ts` and their tests

**Checkpoint**: Falha de IA distinguível (503) de erro interno (500), roteador inválido (502) e timeout (504).

---

## Phase 6: User Story 4 - Configuração declarativa de contingência via ambiente (Priority: P2)

**Goal**: `OPENROUTER_MODEL_FALLBACK` documentada e obrigatória; ausência falha na inicialização.

**Independent Test**: `createOpenRouterModel()` com env de teste completo devolve `ResilientModel` com `primaryModel`/`fallbackModel` corretos; sem `OPENROUTER_MODEL_FALLBACK` lança `OPENROUTER_MODEL_FALLBACK is required` — sem chamada de rede.

### Tests for User Story 4

- [X] T030 [P] [US4] Add failing tests in `src/agents/model.test.ts` that set/restore `process.env` in-test (never read `.env`): full config → `primaryModel`/`fallbackModel` match env; missing `OPENROUTER_MODEL_FALLBACK` → throws `OPENROUTER_MODEL_FALLBACK is required`

### Implementation for User Story 4

- [X] T031 [US4] Validate `OPENROUTER_MODEL_FALLBACK` fail-fast in `createOpenRouterModel` in `src/agents/model.ts`
- [X] T032 [P] [US4] Add `OPENROUTER_MODEL_FALLBACK=` with a comment explaining the contingency model to `.env.example`
- [X] T033 [US4] Make T030 pass in `src/agents/model.ts` / `src/agents/model.test.ts`

**Checkpoint**: Contingência configurável por ambiente sem rebuild.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Suíte verde, coerência entre consumidores e validação manual.

- [X] T034 [P] Confirm Arena/bench/history-summarizer/learning-reflector work with `ResilientModel` and emit no `fallback` trace events outside the production graph (no-op scope) in `src/arena.ts`, `src/bench.ts`, `src/conversation/history-summarizer.ts`, `src/memory/learning-reflector.ts`
- [X] T035 [P] Remove `src/agents/test-models.ts` from production imports (test-only usage) and keep it out of `src/index.ts`
- [X] T036 Run `npm run test` and `npm run typecheck` until green (including 011 `ROUTER_FAILED` 502, 010 budgets, 009 summarize, 007 learning, 504 timeout)
- [X] T037 Walk through `specs/012-model-fallback-resilience/quickstart.md` (deterministic table and, optionally, HTTP scenarios with invalid model ids)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — **bloqueia** as user stories
- **US1 (Phase 3)**: depende da Phase 2 — MVP
- **US2 (Phase 4)**: depende de US1 (cadeia com retry e escopo no grafo)
- **US3 (Phase 5)**: depende de US2 (erro final vem do `withFallbacks`)
- **US4 (Phase 6)**: depende só da Phase 2; pode ir em paralelo com US1–US3
- **Polish (Phase 7)**: após as stories desejadas

### User Story Dependencies

- **User Story 1 (P1)**: após Phase 2 — retry + `modelUsed`
- **User Story 2 (P1)**: após US1 — fallback + evento + isolamento por turno
- **User Story 3 (P1)**: após US2 — `ModelUnavailableError` + 503
- **User Story 4 (P2)**: após Phase 2 — validação de env + `.env.example`

### Within Each User Story

- Testes falhando antes da implementação
- `model.ts` antes do grafo; grafo antes do HTTP
- `model.ts` é tocado por US1–US4: fazer em sequência para evitar conflitos

### Parallel Opportunities

- T002 em paralelo a T001
- T004, T005, T006 em paralelo após T003
- T010 e T011 em paralelo
- T016, T017, T018 em paralelo (T017/T018 no mesmo arquivo — escrever juntos)
- T023, T024, T025 em paralelo
- T032 em paralelo a qualquer tarefa; Phase 6 inteira em paralelo com Phases 3–5 se outra pessoa cuidar dos conflitos em `model.ts`
- T034 e T035 em paralelo

---

## Parallel Example: User Story 2

```bash
# Testes US2 em paralelo (arquivos diferentes):
Task: "Failing fallback/reason/401 tests in src/agents/model.test.ts"
Task: "Failing fallback event + modelUsed + next-turn tests in src/agents/production-graph.test.ts"

# Depois, implementação sequencial:
Task: "isRetryableModelError + fallbackReason in src/agents/model.ts"
Task: "withFallbacks composition in src/agents/model.ts"
Task: "drainFallbacks in router/strategy nodes in src/agents/production-graph.ts"
```

---

## Parallel Example: User Story 3

```bash
Task: "Failing ModelUnavailableError tests in src/agents/model.test.ts"
Task: "Failing router passthrough test in src/agents/production-graph.test.ts"
Task: "Failing 503/504 HTTP tests in src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational (superfície `ResilientModel` + ReAct dinâmico)
3. Phase 3 US1 (retry + `modelUsed`)
4. **STOP and VALIDATE**: `npm run test` e `npm run typecheck`
5. Demo: `/chat` com `metrics.modelUsed`

### Incremental Delivery

1. Setup + Foundational
2. US1 → retry transparente (MVP)
3. US2 → fallback + evento `fallback`
4. US3 → 503 em falha total
5. US4 → env obrigatória + `.env.example`
6. Polish → suíte verde + quickstart

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta
- `ChatOpenAI.maxRetries = 0` nos dois modelos — `withRetry` é a única camada de retry
- Reserva tem uma tentativa só; a cada turno o primário é tentado primeiro
- Corpo 503 nunca inclui `cause`, stack ou mensagem do provedor
- Testes usam `retry.stopAfterAttempt` baixo para o backoff do `p-retry` não alongar a suíte
