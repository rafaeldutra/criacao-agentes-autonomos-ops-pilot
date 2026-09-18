# Research: OpsPilot MCP Server

## Decision: Use the official MCP TypeScript SDK with `McpServer` and stdio transport

**Rationale**: The feature is a local process integration for MCP clients. The SDK
provides protocol-compliant initialization, tool discovery, and tool invocation
without implementing JSON-RPC framing manually. `StdioServerTransport` keeps the
launch model compatible with local MCP configurations.

**Alternatives considered**: A hand-written JSON-RPC loop was rejected because it
would duplicate protocol behavior and increase the risk of writing malformed data
to stdout.

## Decision: Register only the three existing operational tools

**Rationale**: The required public surface is exactly `list_alerts`, `open_incident`,
and `resolve_incident`. Existing tools are not exposed accidentally through a
generic registry iteration.

**Alternatives considered**: Exposing every member of `createTools` was rejected
because it would include unrelated tools and violate the exact discovery contract.

## Decision: Reuse `createTools` and its Zod schemas as the adapter source of truth

**Rationale**: The existing LangChain tools already bind the schemas to the same
`OpsStore` operations. The MCP layer should adapt their names, schemas, and
invocation results rather than reimplementing validation or mutations.

**Alternatives considered**: Duplicating schemas in `src/mcp/server.ts` was
rejected because schema drift would make CLI, agent, and MCP behavior inconsistent.

## Decision: Keep stdout exclusively for MCP protocol messages

**Rationale**: stdio MCP clients parse stdout as a protocol stream. The server
entry point will not call `console.log`; startup or unexpected diagnostics use
`console.error`/stderr. Tests will capture stdout and verify no ordinary output.

**Alternatives considered**: Logging to stdout was rejected because even a single
non-protocol line can corrupt the MCP session.

## Decision: Test with an in-process protocol client

**Rationale**: An in-memory transport pair can exercise initialization, discovery,
tool calls, validation, and shared store state without spawning a process or
depending on an external MCP client.

**Alternatives considered**: Testing only exported registration helpers was rejected
because it would not prove the stdio entry point or protocol discovery contract.
