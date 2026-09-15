# OpsStore Contract

## Construction

```ts
new SqliteOpsStore(path?: string)
```

- Explicit `path` wins.
- When omitted, use `process.env.OPSPILOT_DB`.
- When the environment variable is absent, use `./data/opspilot.db`.
- Tests must pass `":memory:"`.
- Construction creates all schema objects idempotently and enables foreign
  keys.

## Operations

```ts
listAlerts(status?: "firing" | "resolved"): Alert[]
openIncident(title: string, service: string, severity: Severity): Incident
listIncidents(status?: "open" | "resolved" | "all"): Incident[]
resolveIncident(id: string, summary?: string): Incident
consultRunbook(service: string): Runbook
close(): void
```

## Tool contract

The agent exposes:

- `list_alerts(status?)`
- `open_incident(title, service, severity)`
- `resolve_incident(id, summary?)`
- `list_incidents(status = "open")`
- `consultar_runbook(service)`

Every Zod field has a description. Status and severity values are enums, and
tool descriptions explain when each operation should be used.

## Error behavior

- Missing service: `DomainError` with `SERVICE_NOT_FOUND`.
- Missing incident: `DomainError` with `INCIDENT_NOT_FOUND`.
- Already resolved incident: `DomainError` with
  `INCIDENT_ALREADY_RESOLVED`.
- Missing runbook: `DomainError` with `RUNBOOK_NOT_FOUND`.
- Invalid closed values: Zod validation failure at the tool boundary or
  SQLite CHECK/constraint failure at the persistence boundary.

## Persistence guarantees

- All DDL is idempotent.
- All runtime values are bound through prepared statements.
- Seed upserts are keyed by canonical ids and do not delete operational
  incidents.
- A resolved lifecycle row has a non-null `resolved_at`; open/firing rows have
  a null `resolved_at`.
