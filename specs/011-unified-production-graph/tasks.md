---
description: "Tarefas de implementação do grafo unificado de produção do OpsPilot"
---

# Tasks: Grafo unificado de produção

**Input**: Design documents from `/specs/011-unified-production-graph/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-014 / SC-001–SC-006 exigem testes determinísticos (override vs roteador, evento `route`, `node`, 422, encaminhamento); constituição exige teste com lógica nova.

**Organization**: Tasks por user story; grafo em `src/agents/production-graph.ts`; IO na borda HTTP; `decideRoute` injetável.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]–[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Esqueleto de arquivos do plano sem alterar o comportamento de `/chat`.

- [ ] T001 Verify layout targets from `specs/011-unified-production-graph/plan.md` (`src/agents/types.ts`, `src/agents/trace.ts`, `src/agents/reflection.ts`, `src/agents/index.ts`, `src/http/server.ts`, `src/http/server.test.ts`)
- [ ] T002 [P] Create stub files `src/agents/production-graph.ts` and `src/agents/production-graph.test.ts` ready for `createProductionGraph` per `specs/011-unified-production-graph/contracts/production-graph.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Tipos de rota/trace e helpers puros — base para todas as stories.

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [ ] T003 Export `GraphNode`, `StrategyRoute`, `RouteDecision`, and extend `TraceEvent` with optional `node` plus variant `{ type: "route"; route; reason; node? }` in `src/agents/types.ts` per `specs/011-unified-production-graph/data-model.md`
- [ ] T004 [P] Add `route()` and `withNode()` helpers in `src/agents/trace.ts` per `specs/011-unified-production-graph/contracts/trace.md`
- [ ] T005 [P] Add failing tests for `route`, `withNode` (non-mutating copy), and `formatTrace` backward-compat (events without `node` stay `[type] …`) in `src/agents/trace.test.ts`
- [ ] T006 Make T005 pass in `src/agents/trace.ts` / `src/agents/trace.test.ts`
- [ ] T007 Export `PRODUCTION_ROUTES` and `isStrategyRoute()` plus `RouterError`/`DomainError` with code `ROUTER_FAILED` from `src/agents/production-graph.ts` per `specs/011-unified-production-graph/data-model.md`

**Checkpoint**: Tipos e helpers verdes; grafo e HTTP ainda no comportamento antigo (`strategy.run`).

---

## Phase 3: User Story 1 - Uma execução, um grafo (Priority: P1) 🎯 MVP

**Goal**: Turno de chat percorre `context` → `router` → uma estratégia → `response`; cliente recebe `answer`, `trace` e `metrics`; prompt vem de `buildContext`.

**Independent Test**: `createProductionGraph` com stubs + `decideRoute` → `react`; `invoke` devolve prompt igual ao builder, thought de contexto, evento `route`, `run` só do react, answer/metrics. HTTP 200 com o mesmo caminho.

### Tests for User Story 1

- [ ] T008 [P] [US1] Add failing graph tests: `context` prompt equals `buildContext`; thought with `node: "context"`; injected `decideRoute` → `react` runs only react stub; result has answer/trace/metrics in `src/agents/production-graph.test.ts` per `specs/011-unified-production-graph/contracts/production-graph.md`
- [ ] T009 [P] [US1] Add failing HTTP test that `/chat` without live LLM uses injected `decideRoute` → `react` and returns 200 with route+answer in `src/http/server.test.ts` per `specs/011-unified-production-graph/contracts/chat-http.md`

### Implementation for User Story 1

- [ ] T010 [US1] Implement `StateGraph` nodes `context` (`buildContext` + `buildContextBreakdown` + thought), stub `router` calling `decideRoute(prompt)`, strategy nodes `react`/`plan-and-execute`/`reflect` (`withReflection` on react), and `response` with conditional edges in `src/agents/production-graph.ts`
- [ ] T011 [US1] Wire `createApp`/`runChat` in `src/http/server.ts` to load stores then `graph.invoke` (remove isolated `strategy.run`); accept `decideRoute` / `reflectionOptions` on `ChatServerOptions`
- [ ] T012 [US1] Update existing `/chat` helpers in `src/http/server.test.ts` to inject `decideRoute` → `react` so current 200/timeout/budget/memory cases stay green while T008–T009 pass in `src/agents/production-graph.test.ts` and `src/http/server.test.ts`

**Checkpoint**: `/chat` usa o grafo; default de teste ainda força react via `decideRoute` injetado.

---

## Phase 4: User Story 2 - O roteador escolhe a estratégia (Priority: P1)

**Goal**: Saída estruturada `{ route, reason }`; tabela de critérios no prompt; só o nó da rota executa; falha do roteador é `ROUTER_FAILED` sem fallback.

**Independent Test**: `decideRoute` injetado para cada uma das três rotas → apenas o stub correspondente `run`; prompt default contém a tabela; throw → nenhuma strategy e erro de domínio.

### Tests for User Story 2

- [ ] T013 [P] [US2] Add failing graph tests: injected route `react` | `plan-and-execute` | `reflect` executes exactly that stub; default router prompt includes the criteria table in `src/agents/production-graph.test.ts` per `specs/011-unified-production-graph/contracts/production-graph.md`
- [ ] T014 [P] [US2] Add failing graph test: `decideRoute` throw → `ROUTER_FAILED` and zero strategy `run` in `src/agents/production-graph.test.ts`
- [ ] T015 [P] [US2] Add failing HTTP test: injected failing `decideRoute` → 502 `{ code: "ROUTER_FAILED" }` in `src/http/server.test.ts` per `specs/011-unified-production-graph/contracts/chat-http.md`

### Implementation for User Story 2

- [ ] T016 [US2] Implement default `decideRoute` with Zod `routeDecisionSchema`, `model.withStructuredOutput`, and markdown routing table in `src/agents/production-graph.ts`
- [ ] T017 [US2] Sum router `llmCalls` (+1 only on LLM path) and measure full-invoke `latencyMs` in the `response` node in `src/agents/production-graph.ts`
- [ ] T018 [US2] Map `ROUTER_FAILED` to HTTP 502 in `src/http/server.ts`
- [ ] T019 [US2] Make T013–T015 pass in `src/agents/production-graph.ts`, `src/agents/production-graph.test.ts`, and `src/http/server.test.ts`

**Checkpoint**: Roteamento automático testável por injeção; falha visível; tabela no prompt de produção.

---

## Phase 5: User Story 3 - Override explícito no chat (Priority: P1)

**Goal**: `strategy` opcional força a rota sem LLM; motivo `client override` no evento `route`; desconhecido → 422 antes do grafo; omitir deixa de defaultar `react`.

**Independent Test**: Graph `override: "plan-and-execute"` não chama `decideRoute`. HTTP `strategy` válido vs `unknown` vs omitido.

### Tests for User Story 3

- [ ] T020 [P] [US3] Add failing graph tests: `override` skips `decideRoute`; route event reason `client override`; only overridden stub runs in `src/agents/production-graph.test.ts`
- [ ] T021 [P] [US3] Add failing HTTP tests: `strategy: "plan-and-execute"` override; omitted `strategy` calls `decideRoute`; `strategy: "unknown"` → 422 and no conversation append in `src/http/server.test.ts` per `specs/011-unified-production-graph/contracts/chat-http.md`

### Implementation for User Story 3

- [ ] T022 [US3] Implement router override (no model call) in `src/agents/production-graph.ts`; validate `strategy` with `isStrategyRoute` in `src/http/server.ts` (422 `Unknown strategy`) and remove `strategy ?? "react"`
- [ ] T023 [US3] Apply HTTP `reflect` decorator on non-`reflect` routes only (no double wrap on node `reflect`) in `src/agents/production-graph.ts`
- [ ] T024 [US3] Make T020–T021 pass in `src/agents/production-graph.test.ts` and `src/http/server.test.ts`

**Checkpoint**: Override observável; 422 inalterado para nomes inválidos; `reflect` válido no body.

---

## Phase 6: User Story 4 - Rastreio com origem de cada evento (Priority: P2)

**Goal**: Todo evento emitido pelo grafo (e `summarize` HTTP) tem `node`; `formatTrace` mostra `@node` quando presente.

**Independent Test**: Inspecionar traces de override e de rota automática — 100% com `node`; evento `route` com `node: "router"`.

### Tests for User Story 4

- [ ] T025 [P] [US4] Add failing graph/HTTP assertions that every returned trace event has `node`, route event is `node: "router"`, and strategy events use the route name in `src/agents/production-graph.test.ts` and `src/http/server.test.ts`
- [ ] T026 [P] [US4] Add failing `formatTrace` cases for `[route@router]` and `[thought@context]` in `src/agents/trace.test.ts` per `specs/011-unified-production-graph/contracts/trace.md`

### Implementation for User Story 4

- [ ] T027 [US4] Stamp `withNode` on context/router/strategy/response events in `src/agents/production-graph.ts`; tag HTTP `summarize` events with `node: "response"` in `src/http/server.ts`
- [ ] T028 [US4] Implement `formatTrace` `@node` prefix when `node` is set in `src/agents/trace.ts`
- [ ] T029 [US4] Make T025–T026 pass in `src/agents/production-graph.test.ts`, `src/http/server.test.ts`, and `src/agents/trace.test.ts`

**Checkpoint**: Observabilidade completa no JSON de `/chat` e na Arena (`node` omitido nas estratégias isoladas).

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Suíte verde, composição e guia de validação.

- [ ] T030 [P] Re-export `createProductionGraph` / `PRODUCTION_ROUTES` from `src/agents/index.ts` if `src/index.ts` or HTTP composition needs a single barrel
- [ ] T031 Confirm Arena/bench still use the registry directly (no production graph) in `src/arena.ts` and `src/bench.ts`
- [ ] T032 Run `npm run test` and `npm run typecheck` until green (including 010 budget, 009 summarize, 007 learning, timeout 504)
- [ ] T033 Walk through `specs/011-unified-production-graph/quickstart.md` scenarios against the implemented graph and HTTP contracts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — **bloqueia** as user stories
- **US1 (Phase 3)**: depende da Phase 2 — MVP
- **US2 (Phase 4)**: depende de US1 (nós do grafo e wire HTTP)
- **US3 (Phase 5)**: depende de US1; pode sobrepor US2 no mesmo `router` node
- **US4 (Phase 6)**: depende de US1 (eventos existirem); completa `node` em todos os caminhos
- **Polish (Phase 7)**: após as stories desejadas

### User Story Dependencies

- **User Story 1 (P1)**: após Phase 2 — grafo mínimo + HTTP
- **User Story 2 (P1)**: após US1 — roteador real/injetado + 502
- **User Story 3 (P1)**: após US1 — override/422 (idealmente após o nó `router` de US1/US2)
- **User Story 4 (P2)**: após US1 — carimbo `node` e formatTrace

### Within Each User Story

- Testes falhando antes da implementação
- Grafo antes do HTTP quando o contrato do grafo muda
- Story completa antes da próxima prioridade (US2/US3 ambas P1: fazer US2 depois de US1, US3 em seguida)

### Parallel Opportunities

- T002 paralelo a T001 após o verify, se o stub não depender da inspeção
- T004 e T005 em paralelo após T003
- T008 e T009 em paralelo
- T013, T014, T015 em paralelo
- T020 e T021 em paralelo
- T025 e T026 em paralelo
- T030 e T031 em paralelo

---

## Parallel Example: User Story 1

```bash
# Testes US1 em paralelo:
Task: "Failing graph tests in src/agents/production-graph.test.ts"
Task: "Failing HTTP decideRoute inject in src/http/server.test.ts"

# Depois, implementação sequencial no mesmo conjunto de arquivos:
Task: "StateGraph in src/agents/production-graph.ts"
Task: "Wire runChat in src/http/server.ts"
Task: "Make tests pass"
```

---

## Parallel Example: User Story 3

```bash
Task: "Failing override tests in src/agents/production-graph.test.ts"
Task: "Failing HTTP override/422 tests in src/http/server.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup
2. Phase 2 Foundational
3. Phase 3 US1 (grafo + `/chat` com `decideRoute` injetado)
4. **STOP and VALIDATE**: `npm run test` no recorte US1
5. Demo: 200 com thought de contexto + route + answer

### Incremental Delivery

1. Setup + Foundational
2. US1 → grafo no chat (MVP)
3. US2 → roteador + 502
4. US3 → override + 422 + sem default `react`
5. US4 → `node` em 100% dos eventos
6. Polish → typecheck/test/quickstart

### Parallel Team Strategy

Com duas pessoas após a Phase 2: A faz US1→US2 no grafo; B prepara testes HTTP (T009/T015/T021) no mesmo `server.test.ts` com cuidado de merge — preferir sequencial no HTTP por conflito de arquivo.

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta
- Não alterar Arena/bench além da verificação T031
- Stubs de `decideRoute` **não** incrementam `llmCalls`; só o caminho `withStructuredOutput`
- Motivo de override estável: `client override`
- Aliases `reflect:react` no `/chat` continuam 422
