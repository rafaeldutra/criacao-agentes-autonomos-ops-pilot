# Implementation Plan: Persistência real de operações

**Branch**: `003-real-ops-persistence` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

## Summary

Substituir a persistência operacional implícita em memória por um boundary
`OpsStore` explícito, com `SqliteOpsStore` baseado em `node:sqlite` e
`DatabaseSync`. O schema será criado no construtor, todas as consultas usarão
prepared statements, o seed Mercadinho será idempotente e a composição do
agente receberá o store por injeção. O `InMemoryStore` permanecerá como double
determinístico para testes e benchmark.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `node:sqlite`/`DatabaseSync`, Zod, `node:test`,
`tsx`, Express, LangChain/LangGraph

**Storage**: SQLite file-backed by `OPSPILOT_DB`, default
`./data/opspilot.db`; `:memory:` for tests

**Testing**: `node:test` through the existing `npm test` command, integration
tests using `:memory:`, and `npm run typecheck`

**Target Platform**: Node.js 22 LTS server, CLI, and benchmark runtime

**Project Type**: TypeScript reasoning library with HTTP and CLI entrypoints

**Performance Goals**: Prepared CRUD operations with no avoidable full-table
  scans for filtered incidents, idempotent startup/seed, and no network or
  filesystem database dependency in deterministic tests

**Constraints**: No SQL concatenation with external input; closed domain
  values enforced both at Zod/tool boundaries and SQLite CHECK constraints;
  production composition uses SQLite; tests and benchmark may inject memory
  doubles; runtime database files are ignored by Git

**Scale/Scope**: Four SQLite tables, five canonical services, six canonical
alerts, three canonical runbooks, incident lifecycle operations, and five
agent tools

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — `src/store/` owns persistence, `src/agents/`
  owns tool adapters, and composition injects the store from the application
  boundary.
- **Validação na fronteira**: PASS — tool inputs use Zod enums and described
  fields before reaching store methods.
- **Erros de domínio**: PASS — missing services, incidents, runbooks, and
  invalid lifecycle transitions remain explicit domain errors.
- **Funções puras**: PASS — seed mapping, row conversion, and filter
  normalization remain pure where possible; database IO stays in the store.
- **Teste obrigatório**: PASS — all SQLite CRUD, seed, CHECK, tool, and
  composition paths have deterministic `:memory:` coverage.
- **Segurança**: PASS — prepared statements prevent SQL injection, no secrets
  are persisted, and runtime database files are ignored.
- **Spec antes de código**: PASS — this plan follows the approved
  `003-real-ops-persistence` specification.
- **Pequeno e reversível**: PASS — the in-memory implementation remains
  available for tests/bench and the store boundary limits migration scope.
- **Persistência local explícita**: PASS — SQLite/DatabaseSync and
  `OPSPILOT_DB` are the only production persistence path.
- **Reprodutibilidade**: PASS — the canonical seed is idempotent and shared by
  SQLite and deterministic doubles.

## Project Structure

```text
specs/003-real-ops-persistence/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── ops-store.md

src/
├── store/
│   ├── ops-store.ts
│   ├── sqlite-ops-store.ts
│   └── sqlite-ops-store.test.ts
├── agents/
│   ├── store.ts
│   ├── tools.ts
│   ├── tools.test.ts
│   └── ...
├── http/
│   └── server.ts
└── ...

data/
├── seed.json
└── opspilot.db             # runtime only, ignored by Git
```

**Structure Decision**: Introduce `src/store/` for the public persistence
boundary and SQLite implementation. Keep the existing `src/agents/store.ts`
temporarily as the in-memory double or move its implementation behind the new
interface without changing benchmark semantics. Agent tools receive an
`OpsStore` rather than constructing a hidden default store.

## Phase 0 — Research

1. Confirm Node.js 22 `node:sqlite` `DatabaseSync` APIs, transaction behavior,
   prepared statement binding, and row typing.
2. Define SQLite schema constraints for nullable timestamps, incident summary,
   service tier, alert/incident status, and severity.
3. Define an idempotent seed strategy that preserves operational mutations and
   does not duplicate canonical services, alerts, or runbooks.
4. Define the compatibility shape between `InMemoryStore`, `SqliteOpsStore`,
   and the existing tool/strategy constructors.
5. Define shutdown/close ownership for HTTP, CLI, tests, and benchmark stores.

## Phase 1 — Design

- Model store entities, nullable fields, keys, indexes, and state transitions
  in `data-model.md`.
- Document the `OpsStore` interface and tool-facing operations in
  `contracts/ops-store.md`.
- Document deterministic `:memory:` validation and file-backed smoke checks in
  `quickstart.md`.
- Re-evaluate the constitution after the schema, injection, and migration
  design is fixed.

## Implementation Notes

- Use static SQL strings for DDL and prepared statements for all DML/queries.
- Bind values even when filters are optional; use separate prepared statements
  for `open`, `resolved`, and `all` incident queries rather than concatenating a
  status fragment.
- Use `INSERT ... ON CONFLICT DO UPDATE` only for canonical seed rows and avoid
  overwriting mutable incident state.
- Keep `summary` nullable and preserve `resolved_at` nullability according to
  lifecycle status.
- Add `.describe()` to every Zod tool field, including optional filters and
  identifiers.
- Make `createTools(store)` and registry factories accept an explicit store;
  defaults belong only at composition boundaries.

## Constitution Check — Post-Design

- **Schema and validation**: PASS — domain enums are constrained by both Zod
  and SQLite CHECK clauses.
- **Persistence safety**: PASS — all runtime values are bound parameters and
  no query is assembled from request input.
- **Injection and reproducibility**: PASS — production SQLite and test/bench
  doubles implement the same boundary.
- **Testing**: PASS — each user story has an independent `:memory:` test path.

## Complexity Tracking

No constitution violations require justification.
