# Research: Persistência real de operações

## Decision: Use Node.js native SQLite

**Decision**: Implement the durable store with `node:sqlite` and
`DatabaseSync`, using a file path from `OPSPILOT_DB` and `:memory:` in tests.

**Rationale**: This is the constitution-mandated runtime, removes the need for
an external database service, and supports synchronous prepared statements that
fit the current synchronous store methods.

**Alternatives considered**: Sequelize/MySQL was rejected because it adds an
external service and contradicts the updated persistence policy. A third-party
SQLite driver was rejected because native Node support is the required stack.

## Decision: Introduce an explicit `OpsStore` boundary

**Decision**: Define the shared store methods in `src/store/ops-store.ts` and
make both SQLite and in-memory implementations satisfy it.

**Rationale**: Strategies and tools can be composed with a durable store in
production and a deterministic store in tests/bench without hidden globals.

**Alternatives considered**: Keeping tools coupled to `InMemoryStore` was
rejected because it prevents production persistence. Replacing all test doubles
with SQLite was rejected because benchmarks need isolated, reproducible state.

## Decision: Use static prepared statements for optional filters

**Decision**: Prepare separate SQL statements for `open`, `resolved`, and
`all` incident listings, and bind all values.

**Rationale**: It satisfies the no-concatenation rule while keeping queries
simple and auditable.

**Alternatives considered**: Concatenating a validated status fragment was
rejected because validation does not remove the structural SQL risk. A dynamic
query builder was rejected as unnecessary for four tables.

## Decision: Idempotent canonical upserts for seed data

**Decision**: Seed services, alerts, and runbooks by stable primary key with
`ON CONFLICT` upserts; do not seed incidents or overwrite mutable incident
lifecycle fields.

**Rationale**: Re-running startup repairs canonical reference/fixture data
without duplicating rows or resetting operational incident history.

**Alternatives considered**: Delete-and-reinsert was rejected because it could
erase operational mutations. `INSERT OR IGNORE` alone was rejected because it
would not repair incomplete canonical rows.

## Decision: Keep domain errors at the store boundary

**Decision**: Map missing service, incident, and runbook cases to the existing
`DomainError` contract; let SQLite CHECK and constraint failures propagate as
explicit errors.

**Rationale**: The HTTP and agent boundaries already expect explicit failures,
and silent fallbacks would violate the constitution.

**Alternatives considered**: Returning `undefined` for all missing values was
rejected because callers could mistake absence for successful operation.
