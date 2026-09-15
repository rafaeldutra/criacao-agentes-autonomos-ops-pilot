# Data Model: Persistência real de operações

## Store boundary

`OpsStore` is the synchronous domain persistence interface implemented by
`SqliteOpsStore` and the deterministic in-memory double.

Required operations:

- `listAlerts(status?)`
- `openIncident(title, service, severity)`
- `listIncidents(status = "open")`
- `resolveIncident(id, summary?)`
- `consultRunbook(service)`
- `read()`/snapshot support for tests and benchmarks where needed
- `close()` for file-backed and in-memory lifecycle ownership

## SQLite tables

### services

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `name` | TEXT | Unique, required |
| `description` | TEXT | Nullable |
| `tier` | TEXT | Closed CHECK domain, required |

### alerts

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `service_id` | TEXT | Foreign key to services |
| `status` | TEXT | `firing` or `resolved` CHECK |
| `severity` | TEXT | `low`, `medium`, `high`, `critical` CHECK |
| `title` | TEXT | Required |
| `created_at` | TEXT | Required ISO timestamp |
| `resolved_at` | TEXT | Nullable; required when resolved |

### incidents

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `title` | TEXT | Required |
| `service_id` | TEXT | Foreign key to services |
| `severity` | TEXT | Closed severity CHECK |
| `status` | TEXT | `open` or `resolved` CHECK |
| `created_at` | TEXT | Required ISO timestamp |
| `resolved_at` | TEXT | Nullable; required when resolved |
| `summary` | TEXT | Nullable |

### runbooks

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `service_id` | TEXT | Unique foreign key to services |
| `content` | TEXT | Required operational guidance |
| `updated_at` | TEXT | Required ISO timestamp |

## Domain constraints

- Service tier is a closed enum and must be enforced in Zod and SQLite.
- Alert and incident status are closed enums.
- Alert and incident severity are closed enums.
- A resolved alert or incident must have `resolved_at`; an open/firing row must
  keep it null.
- Foreign keys must be enabled on each `DatabaseSync` connection.
- Incident resolution updates status, timestamp, and optional summary in one
  transaction.

## Seed entities

- Five services: `api`, `checkout`, `payments`, `catalog`, `worker`.
- Six alerts: three `firing` and three `resolved`.
- Three runbooks: `checkout`, `payments`, and `auth` service guidance.
- No canonical incidents are inserted by the seed; incidents are operational
  state and must survive repeated seed execution.
