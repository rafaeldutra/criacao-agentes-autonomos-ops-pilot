# External Provider Status Tool Quickstart

## Prerequisites

- Node.js 22 LTS
- Dependencies installed with `npm install`
- No network or provider credentials required for deterministic tests

## Deterministic validation

Run:

```powershell
npm run typecheck
npm run test
```

The provider-status tests should verify:

1. Default GitHub provider and explicit Cloudflare endpoint selection.
2. Compact one-line output from a valid payload with extra fields.
3. One retry after a network failure, timeout, or 5xx response.
4. Readable string output after both attempts fail.
5. Invalid payload rejection as a readable observation.
6. No real network calls by using an injected fake fetch.

## Optional live smoke test

Use the existing Arena or agent integration only when network access is intentionally available. The tool is read-only and should produce a compact provider indicator/description observation.
