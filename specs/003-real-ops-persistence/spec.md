# Feature Specification: Persistência real de operações

**Feature Branch**: `003-real-ops-persistence`  
**Created**: 2026-09-15  
**Status**: Draft  
**Input**: User description: "Persistência real de operações usando SQLite nativo, seed idempotente, novas tools de incidentes e runbooks, e composição injetável."

## User Scenarios & Testing

### User Story 1 - Persisting the operational domain (Priority: P1)

As an operations service, I want services, alerts, incidents, and runbooks persisted in SQLite so that state survives process restarts and uses the same domain contract as the current in-memory store.

**Why this priority**: Durable state is the foundation for all subsequent operational tools.

**Independent Test**: Construct `SqliteOpsStore(":memory:")`, verify the four tables and constraints exist, seed the Mercadinho scenario twice, and confirm the same five services and six alerts are present without duplicates.

**Acceptance Scenarios**:

1. **Given** no database file exists, **When** `SqliteOpsStore` is constructed, **Then** the four tables are created idempotently.
2. **Given** `OPSPILOT_DB` is set, **When** the production store is created without an explicit path, **Then** it opens that path; otherwise it defaults to `./data/opspilot.db`.
3. **Given** a `:memory:` database, **When** the Mercadinho seed runs twice, **Then** it contains five services, six alerts, and the expected runbooks without duplicated rows.
4. **Given** a closed-domain value violates a table CHECK constraint, **When** it is written, **Then** SQLite rejects the write and the error is surfaced.

### User Story 2 - Operating incidents and alerts durably (Priority: P1)

As an on-call operator, I want to open, list, and resolve incidents against SQLite so that operational actions remain available across requests and restarts.

**Why this priority**: The HTTP agent tools already mutate incidents; durable lifecycle behavior must replace the process-local implementation.

**Independent Test**: Use `:memory:`, seed the store, open an incident, list it with `open`, resolve it, list with `resolved`, and verify invalid service and duplicate resolution remain explicit domain errors.

**Acceptance Scenarios**:

1. **Given** a valid service and severity, **When** an incident is opened, **Then** it is persisted with `open` status and a generated id.
2. **Given** incidents with both statuses, **When** `listIncidents` receives `open`, `resolved`, or `all`, **Then** it returns exactly the matching rows; omitted status defaults to `open`.
3. **Given** an open incident, **When** it is resolved, **Then** status and nullable `resolved_at` are updated atomically.
4. **Given** a missing incident or already resolved incident, **When** resolution is requested, **Then** a domain error is thrown and no unrelated row changes.

### User Story 3 - Exposing operational knowledge through tools (Priority: P2)

As an agent, I want tools for incident listing and runbook lookup so that it can inspect durable operational state and follow service-specific procedures.

**Why this priority**: The agent needs read operations beyond alert listing and must receive clear descriptions and constrained schemas.

**Independent Test**: Build tools over a seeded `:memory:` store, invoke `list_incidents` for each filter and `consultar_runbook` for known/unknown services, and verify existing tool tests still pass on SQLite.

**Acceptance Scenarios**:

1. **Given** the seeded store, **When** `list_incidents` is called without status, **Then** only open incidents are returned.
2. **Given** a status filter, **When** `list_incidents` is called, **Then** the schema accepts only `open`, `resolved`, or `all`.
3. **Given** a known service, **When** `consultar_runbook` is called, **Then** the service runbook is returned.
4. **Given** an unknown service, **When** `consultar_runbook` is called, **Then** an explicit domain error or not-found result is returned, never an unrelated runbook.
5. **Given** any tool schema, **When** it is exposed to the model, **Then** every field has a description and closed values use enums.

### User Story 4 - Injecting durable and test stores (Priority: P2)

As a developer, I want the application composition to inject `SqliteOpsStore` while retaining the in-memory double for tests and benchmarks so that production and deterministic scenarios remain reproducible.

**Why this priority**: Explicit composition prevents hidden global state and keeps benchmarks independent from a persistent database.

**Independent Test**: Construct the production registry with an injected SQLite store and construct benchmark strategies with an in-memory store; verify both expose the same tool contract and scenario behavior.

**Acceptance Scenarios**:

1. **Given** the production composition, **When** the agent registry is created, **Then** its tools use `SqliteOpsStore` configured from `OPSPILOT_DB`.
2. **Given** a benchmark or test, **When** an in-memory store is injected, **Then** no runtime database file is created.
3. **Given** existing strategy construction, **When** a store is injected, **Then** ReAct and Plan-and-Execute share that store without hidden replacement.

## Edge Cases

- `OPSPILOT_DB` is empty or invalid; the configuration error is explicit.
- Parent directories for a file-backed database do not exist; startup reports the filesystem error instead of silently falling back to memory.
- Re-running seed preserves operational mutations unless the seed contract explicitly uses idempotent upserts for only the canonical fixture rows.
- Null `resolved_at` is allowed only for open alerts/incidents; resolved rows require a timestamp.
- A runbook lookup for a service without a runbook returns an explicit not-found result.
- SQL inputs are always bound parameters; no user value is concatenated into SQL.
- Store resources are closed deterministically in tests and process shutdown.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide `SqliteOpsStore` in `src/store/sqlite-ops-store.ts` implementing the existing `OpsStore` interface.
- **FR-002**: The store MUST use `node:sqlite` `DatabaseSync`, `OPSPILOT_DB`, default `./data/opspilot.db`, and `:memory:` for tests.
- **FR-003**: The constructor MUST create `services`, `alerts`, `incidents`, and `runbooks` with idempotent DDL.
- **FR-004**: Tables MUST mirror current domain types; incidents MUST include nullable `resolved_at` and `summary`.
- **FR-005**: Closed domain values such as tier, severity, and status MUST be protected by SQLite CHECK constraints.
- **FR-006**: Every query MUST use prepared statements with bound parameters; SQL string concatenation with input is forbidden.
- **FR-007**: The seed MUST be idempotent and reproduce five services, six alerts (three firing and three resolved), and checkout/payments/auth runbooks.
- **FR-008**: The store MUST support alert listing, incident opening, incident listing with `open | resolved | all`, incident resolution, and runbook consultation.
- **FR-009**: `list_incidents` MUST default to `open` and validate its filter with a Zod enum.
- **FR-010**: `consultar_runbook(service)` MUST be exposed as an agent tool with a constrained, described schema.
- **FR-011**: Existing tools MUST use the injected store and retain behavior under `:memory:` tests.
- **FR-012**: Agent composition MUST inject `SqliteOpsStore` for production and retain the in-memory store for tests and benchmarks.
- **FR-013**: All exposed tool fields MUST have `.describe()` metadata and closed values MUST use enums.
- **FR-014**: Runtime database files under `data/` MUST be ignored by Git without removing versioned seed fixtures.

## Key Entities

- **Service**: Operational service identified by id, name, description, and tier.
- **Alert**: Service alert with firing/resolved status, severity, title, timestamps, and nullable resolution timestamp.
- **Incident**: Operational incident with title, service, severity, status, creation timestamp, nullable resolution timestamp, and nullable summary.
- **Runbook**: Service-specific operational guidance for checkout, payments, and auth.
- **OpsStore**: Store boundary shared by production SQLite and deterministic in-memory implementations.

## Success Criteria

- **SC-001**: Two seed executions against the same database produce no duplicate canonical rows.
- **SC-002**: All SQLite integration tests run on `:memory:` without network or filesystem database dependencies.
- **SC-003**: Incident open/list/resolve behavior survives a store reopen against the same file.
- **SC-004**: Invalid status, severity, tier, and related closed values fail through Zod or SQLite CHECK constraints.
- **SC-005**: Existing tool tests pass after switching their fixture store to SQLite `:memory:`.
- **SC-006**: Production composition uses SQLite while benchmark composition remains deterministic and does not create `opspilot.db`.
- **SC-007**: Static review finds no SQL query built by concatenating request or tool input.

## Assumptions

- The existing domain types and `data/seed.json` are the starting point; schema additions are limited to fields required by durable operations.
- `node:sqlite` is available in the project's Node.js 22 runtime and does not require an external database package.
- The current in-memory store remains as a test/benchmark double during migration.
