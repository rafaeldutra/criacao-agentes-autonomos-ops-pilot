---
description: "Tarefas de implementação do Modo Equipe (supervisor + analista/planejador/executor) do OpsPilot"
---

# Tasks: Modo Equipe com Supervisor

**Input**: Design documents from `/specs/016-team-supervisor-mode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O princípio V da constituição exige teste para toda lógica nova; SC-001–SC-004 e SC-007 exigem verificação automatizada (teto, isolamento por papel, aprovação, trace, axe).

**Organization**: tarefas agrupadas por user story.
- **API**: módulo novo `src/team/`; ajustes aditivos em `src/agents/` (`types.ts`, `trace.ts`, `react.ts`, `production-graph.ts`, `index.ts`), `src/http/server.ts` e `src/obs/logger.ts`. Testes em `node:test` colocalizados, com store seed Mercadinho em memória (`createSeededStore`), modelos stub (`src/agents/test-models.ts`) e decisor do supervisor injetado (`decideNext`). Nunca usar rede, o modelo real, `.env` ou o `OPSPILOT_DB` padrão.
- **Web**: `web/src/api/schemas.ts` e `web/src/components/TraceStep/`; Vitest + Testing Library + `vitest-axe`. Toda UI segue `.github/instructions/design.instructions.md`.
- Contratos de referência: [team-strategy.md](./contracts/team-strategy.md) (T1–T9), [chat-http.md](./contracts/chat-http.md), [web-ui.md](./contracts/web-ui.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]–[US4] mapeiam as stories da spec
- Sempre incluir o caminho do arquivo na descrição

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: linha de base e esqueleto do módulo, sem mudar comportamento.

- [X] T001 Verify baseline: `npm run typecheck`, `npm run test`, `npm run web:typecheck` and `npm run web:test` green on the current tree; note the patterns to mirror: `DecideRoute` injection and `routeDecisionSchema` in `src/agents/production-graph.ts`, `createScriptedModel` in `src/agents/test-models.ts`, `runWithApprovalContext`/`createApprovalContext` in `src/approvals/approval-gate.ts`
- [X] T002 Create `src/team/index.ts` as the module barrel (empty re-exports for now, filled as files are added) so `src/team/` exists per plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tipos, trace e catálogo de papéis que todas as stories usam.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T003 Extend types in `src/agents/types.ts`: `GraphNode` += `"team" | "supervisor" | "analista" | "planejador" | "executor"`; `StrategyRoute = Extract<GraphNode, "react" | "plan-and-execute" | "reflect" | "team">`; add exported `TeamRole = "analista" | "planejador" | "executor"`, `TeamTarget = TeamRole | "done"`; add `TraceEvent` member `{ type: "handoff"; from: "supervisor"; to: TeamTarget; brief: string; limitReached?: boolean; node?: GraphNode }` (data-model.md "TraceEvent handoff"); fix any exhaustive switch the compiler flags (e.g. `src/obs/logger.ts` default branch stays valid)
- [X] T004 Add `handoff(to, brief, limitReached?)` builder to `src/agents/trace.ts` returning `{ type: "handoff", from: "supervisor", to, brief, node: "supervisor", ...(limitReached ? { limitReached: true } : {}) }` and a `handoff` branch in `formatTrace` printing `[handoff@supervisor] -> <to> <brief>` (+ ` (limit)` when `limitReached`); add cases to `src/agents/trace.test.ts`
- [X] T005 [P] Widen the `tools` parameter of `createReactStrategy` in `src/agents/react.ts` to accept a subset of tools (`Partial<AgentTools>` filtered of `undefined`, typed via `Object.values`) without changing behavior for the full `AgentTools`; add a test in `src/agents/strategies.test.ts` (or the existing react test file) that a scripted model bound to a 1-tool subset only sees that tool name in `bindTools`
- [X] T006 [P] Create `src/team/roles.ts` (pure): `TEAM_ROLES = ["analista", "planejador", "executor"] as const`; `ROLE_TOOL_KEYS: Record<TeamRole, readonly (keyof AgentTools)[]>` = analista `listAlerts, listIncidents, consultRunbook, checkProviderStatus`; planejador `[]`; executor `listIncidents, openIncident, resolveIncident`; `toolsForRole(tools: AgentTools, role): Partial<AgentTools>` picking exactly those keys; `ROLE_PROMPTS: Record<TeamRole, string>` per contracts/team-strategy.md "Prompts" (analista: report facts with evidence, NEVER propose actions; planejador: numbered plan from the blackboard, no data lookup; executor: only incident actions from the brief, always fill `reason` on `resolve_incident`, never try to bypass approval); export from `src/team/index.ts`
- [X] T007 [P] Create `src/team/blackboard.ts` (pure): types `BlackboardEntry { seq; role: TeamRole; brief; content; failed?: boolean }`; `appendEntry(entries, role, brief, content, failed?)` returning a new array with `seq = entries.length + 1`; `blackboardAsText(request, entries)` producing plain pt-BR text (`Pedido:` + `#<seq> <Papel> — brief: … — resultado: …`, `(vazio)` when no entries); tests in `src/team/blackboard.test.ts` (ordering, seq, empty render, failed marker)

**Checkpoint**: `npm run typecheck` e `npm run test` verdes; nenhuma rota nova exposta ainda.

---

## Phase 3: User Story 1 - Resolver um pedido operacional com uma equipe de especialistas (Priority: P1) 🎯 MVP

**Goal**: supervisor decide `{ next, brief }` sobre o blackboard, especialistas contribuem, `done` entrega a resposta; rota `team` acessível por override do cliente.

**Independent Test**: `POST /chat` com `strategy: "team"` e decisor stub analista → planejador → executor → done: analista consulta dados, planejador não chama tool, executor abre incidente, resposta = brief do `done` (quickstart §2).

### Tests for User Story 1

- [X] T008 [P] [US1] Supervisor tests in `src/team/supervisor.test.ts`: `supervisorDecisionSchema` accepts `{ next: "analista", brief: "x" }` and `done`; rejects unknown `next`, empty/whitespace `brief`; `assertSupervisorDecision` throws `RouterError` on invalid input; `createDefaultDecideNext` with a scripted model calls `withStructuredOutput` and returns the parsed decision
- [X] T009 [P] [US1] Team graph flow tests in `src/team/team-graph.test.ts` (seeded in-memory store, scripted specialist models, injected `decideNext` sequence analista → planejador → executor → done): (a) result `answer` equals the done brief (T9); (b) trace has exactly 4 `handoff` events in order with `node: "supervisor"`, last `to: "done"`; (c) analista/executor `action`/`observation`/`answer` events carry `node` = role; (d) planejador produced no `action` event and its model never had `bindTools` called (T2); (e) `decideNext` received a blackboard text containing previous entries before each decision (US1 scenario 2); (f) decider returning `done` first yields an answer with zero specialists (edge case); (g) invalid decision → `RouterError` and no specialist ran (T8)
- [X] T010 [P] [US1] Production graph test in `src/agents/production-graph.test.ts`: `override: "team"` routes to node `team`, emits `route` event `{ route: "team", reason: "client override" }`, `result.route === "team"`, team events keep their role `node` and other strategy events get `node: "team"`; existing react/plan-and-execute/reflect tests unchanged
- [X] T011 [P] [US1] HTTP test in `src/http/server.test.ts`: `POST /chat` with `strategy: "team"` (registry with stub team strategy) returns 200 with `route: "team"` and the handoff events in `trace`; `strategy: "foo"` still → 422 `UNKNOWN_STRATEGY`

### Implementation for User Story 1

- [X] T012 [US1] Create `src/team/supervisor.ts`: `supervisorDecisionSchema = z.object({ next: z.enum(["analista", "planejador", "executor", "done"]), brief: z.string().trim().min(1) })`, `finishOnlySchema` (`next: z.literal("done")`), type `SupervisorDecision`, `DecideNext = (input: { blackboard: string; forceFinish: boolean; reason?: "limit" | "approval" }) => Promise<SupervisorDecision>`, `SUPERVISOR_PROMPT` (roles table, when to pick each, `done` brief = final pt-BR answer based only on the blackboard, mention pending approval if any), `createDefaultDecideNext(model)` using `model.withStructuredOutput(forceFinish ? finishOnlySchema : supervisorDecisionSchema)` and `assertSupervisorDecision` throwing `RouterError` (import from `src/agents/production-graph.ts`); export from `src/team/index.ts`
- [X] T013 [US1] Create `src/team/team-graph.ts`: `TeamState` `Annotation.Root` (`request`, `entries` concat, `decisions` number, `pendingDecision`, `answer`, `trace` concat, `llmCalls` sum, `promptTokens` via `addOptionalPromptTokens`) per data-model.md; nodes `supervisor` (calls `decideNext({ blackboard: blackboardAsText(...), forceFinish: false })`, validates, increments `decisions`, appends `handoff(...)`; on `done` sets `answer`) and one node per role; analista/executor run `createReactStrategy(model, toolsForRole(tools, role)).run(prompt)` where prompt = `ROLE_PROMPTS[role]` + brief + `blackboardAsText`; planejador runs `model.invoke([SystemMessage(ROLE_PROMPTS.planejador), HumanMessage(brief + blackboard)])` without `bindTools` and emits `thought`/`answer`; specialist events stamped with `withNode(events, role)` plus `fallbackEvents(role)` from `drainFallbacks`; specialist non-fatal errors become a `failed` entry + `observation` (rethrow `ModelUnavailableError`); conditional edges `supervisor → analista|planejador|executor|END`, every role → `supervisor`
- [X] T014 [US1] Add `createTeamStrategy(model, tools, options?: { decideNext?: DecideNext })` to `src/team/team-graph.ts` returning `ReasoningStrategy` `{ name: "team", run(input) }` that invokes the compiled graph with `request: input`, returns `{ answer, trace, metrics }` (`llmCalls` = supervisor calls + specialists, `latencyMs`, `promptTokens`), pushing a final `answer` event when absent; export from `src/team/index.ts`
- [X] T015 [US1] Wire the route in `src/agents/production-graph.ts`: `PRODUCTION_ROUTES` += `"team"`; `ProductionGraphOptions.strategies.team?: ReasoningStrategy`; `runStrategy("team")` uses `options.strategies.team` (throw `RouterError` if missing), still wrapped by `withReflection` when `reflectRequested`; add node `team`, conditional edge entry `team: "team"` and edge `team → response`
- [X] T016 [US1] Register the strategy in `src/agents/index.ts` (`team: createTeamStrategy(model, tools)` in `createAgentRegistry`, sharing the same `tools` instance so `resolveIncident` keeps its approval gate) and pass `team: registry.team` in `createProductionGraph({ strategies })` inside `runChat` in `src/http/server.ts`

**Checkpoint**: US1 testável sozinha — `strategy: "team"` funciona ponta a ponta com stubs.

---

## Phase 4: User Story 2 - Garantir que cada papel respeita seus limites (Priority: P1)

**Goal**: isolamento estrutural de tools por papel e aprovação humana sem bypass.

**Independent Test**: tentativas fora de escopo por papel não executam; `resolve_incident` do executor dentro de approval context gera `APPROVAL_REQUIRED` e encerra; grant negado deixa o incidente aberto (quickstart §3).

### Tests for User Story 2

- [X] T017 [P] [US2] Role isolation tests in `src/team/roles.test.ts`: tool names from `toolsForRole(createTools(store), role)` are exactly analista `{list_alerts, list_incidents, consultar_runbook, check_provider_status}`, planejador `{}`, executor `{list_incidents, open_incident, resolve_incident}` (T1, T3); no role contains `forget_preference` (T4); analista set contains no state-changing tool; `ROLE_PROMPTS.analista` forbids proposing actions
- [X] T018 [P] [US2] Out-of-scope attempt tests in `src/team/team-graph.test.ts`: scripted analista model emitting a tool call to `open_incident` does not change the store (tool not bound → no execution); executor `resolveIncident` instance is the gated one (calling it inside `runWithApprovalContext(createApprovalContext(), …)` returns `APPROVAL_REQUIRED` and leaves the incident open)
- [X] T019 [P] [US2] Approval flow tests in `src/team/team-graph.test.ts` (inside `runWithApprovalContext`): decider sends executor to resolve an incident → executor observation starts with `APPROVAL_REQUIRED`, context `pending` is set, the next `decideNext` call receives `forceFinish: true, reason: "approval"`, the last handoff is `done`, store unchanged (T5); with a `denied` grant for the same call → blackboard entry contains `DENIED`, store unchanged, no other role can resolve (T6); an approved grant replays the result

### Implementation for User Story 2

- [X] T020 [US2] Add pure `mustFinish(state: { decisions: number; approvalPending: boolean }): { force: boolean; reason?: "limit" | "approval" }` to `src/team/supervisor.ts` (approval branch only here; the limit branch comes in US4) and use it in the `supervisor` node of `src/team/team-graph.ts`, reading `getApprovalContext()?.pending !== undefined`; when forced, call `decideNext({ …, forceFinish: true, reason })` so the default decider uses `finishOnlySchema`; unit-test `mustFinish` in `src/team/supervisor.test.ts`
- [X] T021 [US2] Ensure specialist content recorded on the blackboard includes `APPROVAL_REQUIRED`/`DENIED` observations (use the executor's final answer plus its gated observations) in `src/team/team-graph.ts`, so the supervisor and the final answer reflect the pending/denied state

**Checkpoint**: US1 + US2 verdes; SC-002 e SC-003 cobertos por testes.

---

## Phase 5: User Story 3 - Ver as passagens de bastão no "Ver raciocínio" (Priority: P2)

**Goal**: evento `handoff` visível, distinto e acessível na war room; logs e trace persistido com metadados apenas.

**Independent Test**: com uma resposta `team` de fixture, abrir "Ver raciocínio" e ver "Passagem" com etapa "Supervisor", destino e brief em texto, passos dos especialistas rotulados pelo papel; axe sem violações.

### Tests for User Story 3

- [X] T022 [P] [US3] Logger test in `src/obs/logger.test.ts`: `traceEventMeta` for a `handoff` event returns `{ seq, node: "supervisor", type: "handoff", to, chars }` (+ `limitReached` when set) and never the brief text (contracts/chat-http.md "Logs")
- [X] T023 [P] [US3] Persisted trace test in the existing request-trace/trace-log test file under `src/http/` (`request-trace.test.ts`): a turn whose trace has `handoff` events persists and reads them back unchanged, in order
- [X] T024 [P] [US3] Add fixture `specs/016-team-supervisor-mode/contracts/fixtures/chat-200-team.json` (route `team`, trace per contracts/chat-http.md example, including one `handoff` with `limitReached: true`) and schema tests in `web/src/api/schemas.test.ts`: parses as known events, route `team` accepted, nodes `team|supervisor|analista|planejador|executor` accepted, `handoff` with missing `brief` falls back to unknown event
- [X] T025 [P] [US3] Describe/render tests in `web/src/components/TraceStep/describe.test.ts` and a TraceStep render test: `handoff` → label "Passagem", nodeLabel "Supervisor", body `{ kind: "handoff", toLabel: "Analista"|…|"Encerrar", brief, limitReached }`; brief with `<b>x</b>` renders as literal text; accessible name "Passagem para Analista"; route `team` → "Equipe"; node `analista` → "Analista"
- [X] T026 [P] [US3] A11y test in `web/src/a11y.test.tsx`: reasoning panel opened on the `chat-200-team.json` fixture has no vitest-axe violations (SC-007)

### Implementation for User Story 3

- [X] T027 [P] [US3] Add the `handoff` case to `traceEventMeta` in `src/obs/logger.ts` (`to`, `limitReached`, `chars: brief.length`; never the brief)
- [X] T028 [US3] Update `web/src/api/schemas.ts`: `graphNodeSchema` += `team, supervisor, analista, planejador, executor`; `routeNameSchema` += `team`; `knownTraceEventSchema` += `z.object({ type: z.literal("handoff"), to: z.enum(["analista", "planejador", "executor", "done"]), brief: z.string(), limitReached: z.boolean().optional(), ...nodeField })`
- [X] T029 [US3] Update `web/src/components/TraceStep/describe.ts`: `NODE_LABELS` += Equipe/Supervisor/Analista/Planejador/Executor; `ROUTE_LABELS.team = "Equipe"`; `TEAM_TARGET_LABELS` (+ `done: "Encerrar"`); `TraceBody` += `{ kind: "handoff"; toLabel: string; brief: string; limitReached: boolean }`; `case "handoff"` returning label "Passagem"
- [X] T030 [US3] Render the `handoff` body in `web/src/components/TraceStep/TraceStep.tsx` (+ `TraceStep.module.css` using existing tokens): "Para: <toLabel>" emphasized, brief as plain text (no HTML/markdown), a textual notice "Teto de 8 passagens atingido" when `limitReached`, `aria-label` "Passagem para <toLabel>"; visually distinct from thought/action/observation and correct in dark mode

**Checkpoint**: US3 verde em `npm run test` e `npm run web:test`.

---

## Phase 6: User Story 4 - Escolher e limitar a rota "team" (Priority: P2)

**Goal**: roteador automático conhece `team`; teto rígido de 8 decisões com resposta forçada.

**Independent Test**: decisor que sempre devolve `analista` → exatamente 8 handoffs, o 8º `done` com `limitReached: true`, turno responde (quickstart §2/§4).

### Tests for User Story 4

- [X] T031 [P] [US4] Ceiling tests in `src/team/team-graph.test.ts`: decider that always answers `analista` → `decideNext` called 8 times, the 8th with `forceFinish: true, reason: "limit"`, trace has exactly 8 `handoff` events, last `to: "done"` with `limitReached: true`, `answer` = that brief (T7, SC-001); decider choosing the same role repeatedly counts each pass; done before the ceiling never sets `limitReached`
- [X] T032 [P] [US4] Router tests in `src/agents/production-graph.test.ts`: a stub `decideRoute` returning `{ route: "team" }` routes to the team node with `source: "llm"`; `routeDecisionSchema` accepts `team`; `ROUTER_PROMPT` table contains a `team` row
- [X] T033 [P] [US4] Ceiling + approval edge test in `src/team/team-graph.test.ts`: pending approval raised on the 7th pass → 8th decision forced with `reason: "approval"` (approval takes precedence), pending call stays pending and the store is unchanged

### Implementation for User Story 4

- [X] T034 [US4] Add `TEAM_MAX_DECISIONS = 8` and the limit branch to `mustFinish` in `src/team/supervisor.ts` (force when `decisions === TEAM_MAX_DECISIONS - 1`; approval reason wins when both apply); in `src/team/team-graph.ts` mark the forced-by-limit handoff with `limitReached: true`; extend `src/team/supervisor.test.ts` for both branches
- [X] T035 [US4] Add the `| team | investigar, decidir e agir sobre incidentes em etapas com papeis separados |` row to `ROUTER_PROMPT` in `src/agents/production-graph.ts`

**Checkpoint**: todas as stories verdes; SC-001 coberto.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T036 [P] Append the additive deltas (strategy `team`, nodes, `handoff` event) to `specs/014-war-room-web/contracts/chat-http.md` as a "Ver também: 016" note pointing to `specs/016-team-supervisor-mode/contracts/chat-http.md`
- [X] T037 Regression run: `npm run typecheck`, `npm run test`, `npm run web:typecheck`, `npm run web:test` all green; confirm react/plan-and-execute/reflect tests untouched in behavior (SC-006)
- [ ] T038 Run quickstart.md §2, §3 and §5 manually against a real model (requires `OPENROUTER_API_KEY` in the environment); record observations, adjusting only prompts in `src/team/roles.ts`/`src/team/supervisor.ts` if roles drift from their limits

- [X] T039 Allow `team` in the `requests.route` CHECK of `src/store/sqlite-request-store.ts` and rebuild the table on legacy files in `migrate` (research R11); tests in `src/store/request-store.test.ts` for a team round trip (fake + SQLite) and for migrating a legacy file with rows

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories.
- **US1 (Phase 3)** depende de Phase 2; é o MVP.
- **US2 (Phase 4)** depende de US1 (usa o grafo da equipe e o nó supervisor).
- **US3 (Phase 5)**: a parte web (T024–T030) e o logger (T022, T027) dependem só de Phase 2; o teste de trace persistido (T023) depende de US1.
- **US4 (Phase 6)** depende de US1; T034 estende `mustFinish` criado em T020 (US2).
- **Polish** depois de todas as stories.

### User Story Dependencies

- US1 → US2 → US4 (cadeia em `src/team/supervisor.ts`/`team-graph.ts`).
- US3 é paralela a US1/US2/US4 no lado web.

### Within Each User Story

- Testes escritos primeiro e falhando; depois a implementação.
- `supervisor.ts` antes de `team-graph.ts`; `team-graph.ts` antes de `production-graph.ts`/`index.ts`/`server.ts`.

### Parallel Opportunities

- Phase 2: T005, T006, T007 em paralelo (após T003/T004).
- US1: T008–T011 em paralelo.
- US2: T017–T019 em paralelo.
- US3: T022–T027 em paralelo; web inteira em paralelo com US1/US2.
- US4: T031–T033 em paralelo.

---

## Parallel Example: User Story 1

```bash
# Testes de US1 juntos:
Task: "Supervisor tests in src/team/supervisor.test.ts"            # T008
Task: "Team graph flow tests in src/team/team-graph.test.ts"       # T009
Task: "Production graph test for override team"                     # T010
Task: "HTTP test for strategy team in src/http/server.test.ts"     # T011

# Em paralelo, outra pessoa no lado web (US3):
Task: "Schemas + fixture chat-200-team.json"                        # T024, T028
Task: "describe.ts / TraceStep handoff"                             # T025, T029, T030
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 + Phase 2.
2. Phase 3 (US1) → validar com `strategy: "team"` e stubs.
3. Parar e revisar antes de seguir.

Observação: até US4, o único limite de iterações da equipe é o `recursionLimit` padrão do LangGraph (erro, não resposta); por isso US4 deve vir antes de qualquer uso real com modelo.

### Incremental Delivery

1. US1 → equipe funcionando por override.
2. US2 → limites por papel e aprovação comprovados (pré-requisito de uso em produção).
3. US3 → transparência na war room.
4. US4 → roteamento automático e teto de 8.

### Parallel Team Strategy

- Pessoa A: US1 → US2 → US4 (API, `src/team/`).
- Pessoa B: US3 web + logger desde o fim da Phase 2.

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta.
- Nada de rede, `.env` ou modelo real nos testes; o quickstart §2–§5 é a única validação com modelo real.
- Commit por tarefa ou grupo lógico; `git push` exige aprovação manual (constituição VI).
