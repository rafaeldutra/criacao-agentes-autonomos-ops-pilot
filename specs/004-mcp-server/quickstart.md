# OpsPilot MCP Server Quickstart

## Prerequisites

- Node.js 22 LTS
- Dependencies installed with `npm install`
- No API key or `.env` file is required for the local MCP store

## Deterministic validation

Run:

```powershell
npm run typecheck
npm run test
```

The MCP tests should verify:

1. Initialization identifies the server as `opspilot`.
2. `tools/list` returns exactly `list_alerts`, `open_incident`, and `resolve_incident`.
3. The discovered schemas match the existing operational tool schemas.
4. A valid incident can be opened and resolved through one shared store.
5. Invalid input does not mutate the store.
6. No ordinary diagnostics are written to stdout.

## Local launch

Run:

```powershell
npm run mcp
```

This command is intended to be configured as a local MCP server command. Do not
pipe arbitrary logs into stdout; use the MCP client for protocol communication
and stderr for diagnostics.
