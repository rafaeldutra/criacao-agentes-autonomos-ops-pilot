# Persistência real de operações: Quickstart

## Prerequisites

- Node.js 22 LTS with `node:sqlite` available.
- Dependencies installed in `ops-pilot/`.
- No network or OpenRouter credentials are required for store/tool tests.

## Deterministic validation

From the project root:

```powershell
npm run typecheck
npm test
```

The tests must cover:

1. `SqliteOpsStore(":memory:")` creates all four tables idempotently.
2. The Mercadinho seed can run twice without duplicate canonical rows.
3. Five services, six alerts, three firing alerts, and three resolved alerts are
   present after seeding.
4. SQLite CHECK constraints reject invalid tier, status, and severity values.
5. Incidents can be opened, listed as `open`, resolved with optional summary,
   and listed as `resolved` or `all`.
6. `list_incidents` defaults to `open` and rejects unsupported filters.
7. `consultar_runbook` returns checkout/payments/auth runbooks and explicitly
   fails for unknown services.
8. Existing tools use an injected `:memory:` store and do not create a file.

## File-backed smoke check

Use a temporary path outside the repository or an ignored `data/` path:

```powershell
$env:OPSPILOT_DB = ".\data\opspilot.db"
npm run dev
```

Stop the process and start it again. The schema and canonical seed must load
without duplicate rows, while operational incidents remain persisted.

## Security checks

Review the store implementation for:

- no SQL string interpolation with service names, ids, statuses, or tool input;
- prepared statements for every read and write;
- no secrets or credentials written to SQLite;
- runtime `data/*.db` files ignored by Git while `data/seed.json` remains
  versioned.
