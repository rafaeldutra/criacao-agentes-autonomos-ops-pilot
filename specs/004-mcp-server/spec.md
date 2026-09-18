# Feature Specification: OpsPilot MCP Server

**Feature Branch**: `004-mcp-server`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "MCP server do OpsPilot: src/mcp/server.ts com @modelcontextprotocol/sdk, transport stdio, expondo list_alerts, open_incident e resolve_incident - reutilizando o mesmo OpsStore e os mesmo schemas zod ddas tools existentes (uma unica fonte de verdade). Nome do server: opspilot. Script npm: mcp = \"tsx src/mcp/server.ts\" (se precisar de env. alterar o script e carregar elas antes). REGRA CRÍTICA: nenhum console.log no server - no stdio o stdout é o canal do protocolo; diagnóstico vai para stderr. Text: sobre o serve e valida o list de tools"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discovering OpsPilot tools (Priority: P1)

As an MCP client, I want to connect to the OpsPilot server and discover its operational tools so that an agent can understand which alert and incident actions are available.

**Why this priority**: Tool discovery is the minimum capability required before any MCP client can use OpsPilot.

**Independent Test**: Start the server through its stdio entry point, send the MCP initialization and tool-list requests, and verify the server identifies itself as `opspilot` and returns exactly `list_alerts`, `open_incident`, and `resolve_incident`.

**Acceptance Scenarios**:

1. **Given** an MCP client starts the server over stdio, **When** the client initializes the connection, **Then** the server identifies itself with the name `opspilot` and a useful description of its on-call alert and incident management purpose.
2. **Given** the client requests the available tools, **When** discovery completes, **Then** the response contains exactly `list_alerts`, `open_incident`, and `resolve_incident`.
3. **Given** the server is communicating over stdio, **When** it emits diagnostics, **Then** protocol messages remain uncontaminated and diagnostics are written only to stderr.

---

### User Story 2 - Reusing operational tool contracts (Priority: P1)

As an on-call agent, I want the MCP tools to use the same input contracts as the existing OpsPilot tools so that behavior and validation remain consistent across CLI, agent, and MCP clients.

**Why this priority**: A single source of truth prevents clients from receiving different schemas or operational semantics depending on the integration surface.

**Independent Test**: Inspect the discovered input schemas and invoke each MCP tool with valid and invalid inputs, verifying that the existing validation rules and store behavior are preserved.

**Acceptance Scenarios**:

1. **Given** a client discovers `list_alerts`, `open_incident`, and `resolve_incident`, **When** it reads their input schemas, **Then** each schema matches the corresponding existing operational tool schema.
2. **Given** a client invokes `open_incident` with valid data, **When** the operation completes, **Then** the incident is created in the same operational store used by OpsPilot.
3. **Given** a client invokes `resolve_incident` for an existing incident, **When** the operation completes, **Then** that incident is resolved through the existing store behavior.
4. **Given** a client sends invalid input to any exposed tool, **When** validation runs, **Then** the request is rejected using the existing Zod contract without silently accepting malformed data.

---

### User Story 3 - Running the server safely from the project (Priority: P2)

As an operator configuring an MCP client, I want a documented project command to launch the OpsPilot server so that it can be integrated without knowing internal module details.

**Why this priority**: A stable launch command makes the integration repeatable for local development and MCP client configuration.

**Independent Test**: Run the documented package command in a controlled process, confirm it starts without writing protocol data to stdout outside MCP messages, and terminate it cleanly.

**Acceptance Scenarios**:

1. **Given** project dependencies are installed, **When** the operator runs the MCP package command, **Then** the OpsPilot MCP server starts using stdio transport.
2. **Given** the server is launched through the package command, **When** it reports diagnostics, **Then** it uses stderr and never uses stdout for non-protocol logs.

## Edge Cases

- A client requests tool discovery before completing initialization; the server follows the MCP protocol error behavior without writing arbitrary stdout.
- A client sends an unsupported tool name; the server returns a protocol-level unknown-tool error.
- A client sends malformed input; the shared Zod schema rejects it and the store is not mutated.
- The default store cannot be initialized; the server reports the startup failure on stderr and does not emit a misleading successful protocol response.
- The server receives an orderly stdio shutdown; it closes its transport without leaving unrelated resources running.
- The source tree contains no `console.log` in the MCP server entry point or its MCP-specific adapter code.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an MCP server entry point at `src/mcp/server.ts`.
- **FR-002**: The server MUST use stdio as its MCP transport.
- **FR-003**: The server MUST identify itself with the name `opspilot`.
- **FR-004**: The server description MUST explain that it supports on-call alert and production incident management.
- **FR-005**: The server MUST expose exactly these operational tools: `list_alerts`, `open_incident`, and `resolve_incident`.
- **FR-006**: The exposed `list_alerts` tool MUST use the existing alert-listing Zod schema and operational store behavior.
- **FR-007**: The exposed `open_incident` tool MUST use the existing incident-opening Zod schema and operational store behavior.
- **FR-008**: The exposed `resolve_incident` tool MUST use the existing incident-resolution Zod schema and operational store behavior.
- **FR-009**: The MCP integration MUST reuse the existing `OpsStore` instead of defining a separate operational data model or duplicate mutation logic.
- **FR-010**: The MCP integration MUST reuse the existing Zod schemas as the single source of truth for the exposed tool inputs.
- **FR-011**: The project MUST provide an `npm run mcp` command that launches the MCP server entry point.
- **FR-012**: The MCP server MUST NOT write diagnostics or ordinary logs to stdout.
- **FR-013**: Diagnostics emitted by the MCP server MUST be written to stderr.
- **FR-014**: The system MUST include an automated test that validates server identity and the complete discovered tool list.
- **FR-015**: Invalid tool input MUST be rejected without mutating the operational store.

### Key Entities

- **MCP Server**: The named `opspilot` protocol endpoint that exposes OpsPilot operational capabilities over stdio.
- **Operational Tool**: One of the three discoverable alert or incident actions, including its shared input schema and store operation.
- **OpsStore**: The existing operational store that owns alert and incident state for MCP invocations.
- **Tool Discovery Result**: The protocol response containing the server identity and exactly the supported tool names and schemas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An MCP client completes initialization and tool discovery successfully in 100% of deterministic integration-test runs.
- **SC-002**: Tool discovery returns exactly three tools, with no missing or unexpected operational tool names.
- **SC-003**: All three exposed tools apply the same validation rules as their existing counterparts, with invalid-input tests producing zero store mutations.
- **SC-004**: A valid incident can be opened and resolved through the MCP surface using the same store state observed by the existing operational tools.
- **SC-005**: Deterministic server tests observe zero non-protocol messages written to stdout.
- **SC-006**: An operator can launch the server with one documented package command without invoking the source file directly.

## Assumptions

- The existing `OpsStore` factory and operational tools remain the source of truth for the default store and schemas.
- The MCP SDK version selected for the project provides a stdio transport compatible with the supported Node.js runtime.
- MCP clients communicate using the standard initialization, tool-list, and tool-call protocol requests.
- Authentication, remote network transport, and tools unrelated to alert listing or incident lifecycle are out of scope for this version.
- The package command is intended for local MCP client configuration and does not need to load secrets or read `.env`.
