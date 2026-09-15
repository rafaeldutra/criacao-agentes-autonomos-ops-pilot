---

description: "Task list for implementing real SQLite operational persistence"
---

# Tasks: Persistência real de operações

**Input**: Design documents from `/specs/003-real-ops-persistence/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/ops-store.md`, `quickstart.md`

**Tests**: Required by the feature specification and the project constitution. All persistence tests use SQLite `:memory:`.

## Phase 1: Setup

**Purpose**: Prepare the repository and resolve the domain/fixture decisions required before implementation.

- [ ] T001 [P] Review the current domain types, in-memory store, seed fixture, and tool constructors in `src/agents/types.ts`, `src/agents/store.ts`, `data/seed.json`, and `src/agents/tools.ts`
- [ ] T002 [P] Confirm Node.js 22 `node:sqlite`/`DatabaseSync` availability and update `package.json` or TypeScript configuration only if required for native SQLite imports
- [ ] T003 Resolve the `auth` runbook versus current five-service fixture mismatch and document the chosen service/runbook mapping in `data/seed.json` and `specs/003-real-ops-persistence/data-model.md`
- [ ] T004 Add an ignore rule for runtime SQLite files under `data/` while preserving `data/seed.json` in `.gitignore`

---

## Phase 2: Foundational

**Purpose**: Establish the shared store contract, domain fields, and seed representation before SQLite CRUD.

**CRITICAL**: User story implementation depends on this phase.

- [ ] T005 Define the `OpsStore` interface and shared store-facing types in `src/store/ops-store.ts`, including alerts, incidents, runbooks, filters, `read`, and `close`
- [ ] T006 Extend domain types in `src/agents/types.ts` for service tier, runbooks, and nullable incident `summary`/`resolvedAt` without breaking existing strategy contracts
- [ ] T007 [P] Extract shared seed/domain validation and row conversion helpers into `src/store/seed.ts` or an equivalent non-IO module
- [ ] T008 [P] Define domain error codes for missing services, incidents, runbooks, and invalid incident lifecycle operations in `src/store/ops-store.ts`
- [ ] T009 Define the canonical five-service, six-alert, and three-runbook seed records and stable identifiers in `data/seed.json`

**Checkpoint**: The store boundary and canonical fixture are defined; SQLite implementation can begin.

---

## Phase 3: User Story 1 - Persisting the operational domain (Priority: P1) 🎯 MVP

**Goal**: Create an idempotent, constrained SQLite store with deterministic seeding and safe prepared statements.

**Independent Test**: Construct `SqliteOpsStore(":memory:")`, inspect all four tables and CHECK constraints, run the seed twice, and verify canonical counts without duplicates.

### Tests for User Story 1

- [ ] T010 [P] [US1] Add `:memory:` schema creation and idempotent constructor tests in `src/store/sqlite-ops-store.test.ts`
- [ ] T011 [P] [US1] Add seed repeatability tests for five services, six alerts, three firing alerts, three resolved alerts, and three runbooks in `src/store/sqlite-ops-store.test.ts`
- [ ] T012 [P] [US1] Add CHECK and foreign-key rejection tests for invalid tier, status, severity, and invalid service references in `src/store/sqlite-ops-store.test.ts`
- [ ] T013 [P] [US1] Add configuration tests for explicit path, `OPSPILOT_DB`, default `./data/opspilot.db`, and `:memory:` isolation in `src/store/sqlite-ops-store.test.ts`

### Implementation for User Story 1

- [ ] T014 [US1] Implement `SqliteOpsStore` construction with `DatabaseSync`, path resolution, foreign-key activation, idempotent DDL, and deterministic `close()` in `src/store/sqlite-ops-store.ts`
- [ ] T015 [US1] Implement `services`, `alerts`, `incidents`, and `runbooks` tables with primary keys, foreign keys, indexes, nullable fields, and CHECK constraints in `src/store/sqlite-ops-store.ts`
- [ ] T016 [US1] Implement prepared-statement seed upserts that repair canonical rows without deleting incidents or overwriting mutable operational state in `src/store/sqlite-ops-store.ts`
- [ ] T017 [US1] Implement row mappers and `read()` snapshot support for the shared domain types in `src/store/sqlite-ops-store.ts`
- [ ] T018 [US1] Audit every SQLite query to ensure all runtime values use prepared statements and no input is interpolated into SQL in `src/store/sqlite-ops-store.ts`

**Checkpoint**: Durable schema and repeatable seed work independently on `:memory:` and a file-backed database.

---

## Phase 4: User Story 2 - Operating incidents and alerts durably (Priority: P1)

**Goal**: Preserve alert reads and implement durable incident open/list/resolve lifecycle operations.

**Independent Test**: Seed a `:memory:` store, open an incident, list `open`, resolve it with a summary, list `resolved` and `all`, then verify missing and duplicate resolution errors.

### Tests for User Story 2

- [ ] T019 [P] [US2] Add alert filtering tests for `firing`, `resolved`, and unfiltered results in `src/store/sqlite-ops-store.test.ts`
- [ ] T020 [P] [US2] Add incident open tests for service aliases, generated identifiers, severity, timestamps, and persistence across store reopen in `src/store/sqlite-ops-store.test.ts`
- [ ] T021 [P] [US2] Add incident filter tests for default `open`, explicit `resolved`, and `all` in `src/store/sqlite-ops-store.test.ts`
- [ ] T022 [P] [US2] Add atomic resolve tests for `resolvedAt`, nullable summary, missing incidents, and already-resolved incidents in `src/store/sqlite-ops-store.test.ts`

### Implementation for User Story 2

- [ ] T023 [US2] Implement prepared `listAlerts(status?)` queries and map nullable `resolved_at` in `src/store/sqlite-ops-store.ts`
- [ ] T024 [US2] Implement prepared `openIncident(title, service, severity)` with normalized service lookup, generated ids, and explicit `SERVICE_NOT_FOUND` errors in `src/store/sqlite-ops-store.ts`
- [ ] T025 [US2] Implement separate prepared `listIncidents` statements for `open`, `resolved`, and `all`, defaulting to `open`, in `src/store/sqlite-ops-store.ts`
- [ ] T026 [US2] Implement transactional `resolveIncident(id, summary?)` with status guard, timestamp update, and explicit lifecycle errors in `src/store/sqlite-ops-store.ts`
- [ ] T027 [US2] Replace or adapt `InMemoryStore` to implement `OpsStore` while retaining deterministic benchmark/test behavior in `src/agents/store.ts`

**Checkpoint**: Incident and alert operations are durable, filtered, and compatible with the existing domain behavior.

---

## Phase 5: User Story 3 - Exposing operational knowledge through tools (Priority: P2)

**Goal**: Expose SQLite-backed incident listing and runbook consultation while tightening every tool schema and description.

**Independent Test**: Create tools over a seeded `:memory:` store, invoke all incident filters and known/unknown runbook lookups, and run the existing tool tests.

### Tests for User Story 3

- [ ] T028 [P] [US3] Update existing tool tests to construct `SqliteOpsStore(":memory:")` and verify alert/open/resolve behavior in `src/agents/tools.test.ts`
- [ ] T029 [P] [US3] Add `list_incidents` default/filter/invalid-input tests in `src/agents/tools.test.ts`
- [ ] T030 [P] [US3] Add `consultar_runbook` known-service, missing-runbook, and unknown-service tests in `src/agents/tools.test.ts`
- [ ] T031 [P] [US3] Add schema metadata assertions proving every tool field has `.describe()` and closed values use Zod enums in `src/agents/tools.test.ts`

### Implementation for User Story 3

- [ ] T032 [US3] Change `createTools` to accept the `OpsStore` interface and remove hidden `InMemoryStore` coupling from `src/agents/tools.ts`
- [ ] T033 [US3] Add described `listIncidentsSchema` with `open | resolved | all`, default `open`, and implement the `list_incidents` tool in `src/agents/tools.ts`
- [ ] T034 [US3] Add described `consultRunbookSchema` and implement the `consultar_runbook` tool in `src/agents/tools.ts`
- [ ] T035 [US3] Add `.describe()` metadata and explicit usage guidance to all existing tool fields and descriptions, including when `open_incident` should be used, in `src/agents/tools.ts`
- [ ] T036 [US3] Update ReAct and Plan-and-Execute tool typing/imports to consume the shared `AgentTools` result without store-specific casts in `src/agents/react.ts` and `src/agents/plan-and-execute.ts`

**Checkpoint**: All five operational tools share the same injected store and expose precise validated schemas.

---

## Phase 6: User Story 4 - Injecting durable and test stores (Priority: P2)

**Goal**: Use SQLite in production composition while preserving in-memory injection for tests and benchmarks.

**Independent Test**: Build the production registry with SQLite and build benchmark/test strategies with `:memory:`; verify both receive the same tool set and no benchmark database file is created.

### Tests for User Story 4

- [ ] T037 [P] [US4] Add registry composition tests proving production defaults to `SqliteOpsStore` and accepts an injected store in `src/agents/index.test.ts`
- [ ] T038 [P] [US4] Add benchmark injection tests proving `createSeededStore` remains isolated and no `data/opspilot.db` is created in `src/bench.test.ts`
- [ ] T039 [P] [US4] Add HTTP composition coverage verifying `createApp` receives a registry backed by the injected store in `src/http/server.test.ts`

### Implementation for User Story 4

- [ ] T040 [US4] Update `createAgentRegistry` to accept an optional `OpsStore` and default production construction to `new SqliteOpsStore()` in `src/agents/index.ts`
- [ ] T041 [US4] Update `src/index.ts` to own and close the production SQLite store on shutdown while passing it to the registry
- [ ] T042 [US4] Update benchmark composition to create an isolated in-memory store per scenario and inject it through `createTools` in `src/bench.ts`
- [ ] T043 [US4] Update all strategy factories and HTTP wiring to preserve explicit registry/store injection without hidden store creation in `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and `src/http/server.ts`

**Checkpoint**: Production is durable, while tests and benchmarks remain isolated and reproducible.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validate the migration, documentation, and security constraints.

- [ ] T044 [P] Update `specs/003-real-ops-persistence/contracts/ops-store.md`, `data-model.md`, and `quickstart.md` to match final field names and the resolved `auth` runbook mapping
- [ ] T045 [P] Add migration/compatibility notes for existing `src/agents/store.ts` users and benchmark fixtures in `specs/003-real-ops-persistence/quickstart.md`
- [ ] T046 Run `npm run typecheck` and resolve only persistence-related type errors
- [ ] T047 Run `npm test` and verify all existing reflection, arena, HTTP, store, tool, and benchmark tests pass
- [ ] T048 Run the file-backed smoke scenario from `specs/003-real-ops-persistence/quickstart.md` and verify restart persistence
- [ ] T049 Audit the final diff for SQL concatenation, unignored runtime database files, accidental secret persistence, and unintended changes to the existing HTTP contract

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No implementation dependency; resolves runtime and fixture assumptions.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on the shared store boundary and seed model; delivers the SQLite MVP.
- **User Story 2 (Phase 4)**: Depends on the SQLite schema and store implementation from US1.
- **User Story 3 (Phase 5)**: Depends on the store operations from US2.
- **User Story 4 (Phase 6)**: Depends on the complete store and tool boundary from US1-US3.
- **Polish (Phase 7)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2 and is the MVP.
- **US2 (P1)**: Depends on US1.
- **US3 (P2)**: Depends on US2.
- **US4 (P2)**: Depends on US3 for the final tool/store injection shape.

### Parallel Opportunities

- T001, T002, and T004 can run in parallel.
- T007 and T008 can run in parallel after T005/T006.
- T010-T013 can be authored in parallel before T014-T018.
- T019-T022 can be authored in parallel before T023-T027.
- T028-T031 can be authored in parallel before T032-T036.
- T037-T039 can be authored in parallel before T040-T043.
- T044, T045, and T049 can run in parallel with final validation after implementation.

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Deliver US1: schema, seed, constraints, prepared statements, and `read()`.
3. Deliver US2: durable incident and alert lifecycle.
4. Deliver US3: tool migration and runbook/incident tools.
5. Deliver US4: production composition and benchmark/test injection.
6. Complete Polish validation and documentation.

### Task Format Validation

All tasks use the required checklist format, sequential `T###` identifiers,
story labels, exact repository-relative file paths, and `[P]` only where work
can proceed independently.
