# MCP Server Contract

## Launch

The project exposes:

```text
npm run mcp
```

The command starts `src/mcp/server.ts` over stdio and does not require credentials
or direct `.env` access.

## Server identity

The initialization result identifies the server as:

```json
{
  "name": "opspilot",
  "description": "OpsPilot on-call alert and production incident management server"
}
```

The exact prose may be expanded, but it must clearly describe alert and incident
management.

## Tool discovery

`tools/list` returns exactly these tool names:

```json
["list_alerts", "open_incident", "resolve_incident"]
```

Each tool advertises the corresponding existing Zod-derived input contract.

## Tool calls

### `list_alerts`

Input follows `listAlertsSchema`:

```json
{}
```

or:

```json
{ "status": "firing" }
```

### `open_incident`

Input follows `openIncidentSchema`:

```json
{
  "title": "Checkout outage",
  "service": "checkout",
  "severity": "high"
}
```

### `resolve_incident`

Input follows `resolveIncidentSchema`:

```json
{
  "id": "inc-001",
  "summary": "Mitigation verified"
}
```

Successful calls return MCP text content representing the existing tool result.
Invalid input and domain failures are returned as protocol tool errors; they do
not silently mutate or replace the shared store.

## stdout/stderr

stdout is reserved for MCP protocol frames. The MCP server and adapter MUST NOT
write ordinary logs with `console.log`. Diagnostics, if needed, go to stderr.
