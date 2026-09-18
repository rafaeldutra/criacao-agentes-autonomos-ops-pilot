# Data Model: OpsPilot MCP Server

## MCP Server

Protocol endpoint for the local OpsPilot process.

| Field | Type | Rule |
|---|---|---|
| name | `"opspilot"` | Fixed server identity |
| description | string | Explains alert and production incident management |
| transport | stdio | Protocol messages only on stdout |

## Exposed Tool

One of the three MCP capabilities explicitly allowed by this feature.

| Name | Shared input schema | Store operation |
|---|---|---|
| `list_alerts` | `listAlertsSchema` | `OpsStore.listAlerts` |
| `open_incident` | `openIncidentSchema` | `OpsStore.openIncident` |
| `resolve_incident` | `resolveIncidentSchema` | `OpsStore.resolveIncident` |

The MCP discovery response contains exactly these entries. Other existing
OpsPilot tools are not part of this server surface.

## Store State

The server uses the existing `OpsStore` instance for the lifetime of the process.
Incident mutations made through MCP are therefore visible to subsequent MCP
calls using that server instance.

## Tool Result

Each successful tool call returns the existing operational result adapted to the
MCP text-content response format. Validation or domain failures are surfaced as
tool-call errors and must not create partial store mutations.

## State Transitions

```text
server process
  -> initialized MCP session
  -> tools/list
  -> tools/call
      -> list_alerts: read store
      -> open_incident: validate -> create incident
      -> resolve_incident: validate -> resolve incident
  -> orderly shutdown
```
