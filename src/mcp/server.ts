import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { OpsStore } from "../store/ops-store.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import {
  createTools,
  listAlertsSchema,
  openIncidentSchema,
  resolveIncidentSchema,
} from "../agents/tools.js";

export const MCP_SERVER_INFO = {
  name: "opspilot",
  version: "1.0.0",
} as const;

export const MCP_SERVER_DESCRIPTION =
  "OpsPilot on-call alert and production incident management server.";

const asText = (value: unknown): { content: [{ type: "text"; text: string }] } => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

export const createMcpServer = (store: OpsStore): McpServer => {
  const tools = createTools(store);
  const server = new McpServer(MCP_SERVER_INFO);

  server.registerTool(
    "list_alerts",
    {
      description: "List production alerts, optionally filtered by status.",
      inputSchema: listAlertsSchema,
    },
    async (input) => asText(await tools.listAlerts.invoke(input)),
  );
  server.registerTool(
    "open_incident",
    {
      description: "Open an incident for a service.",
      inputSchema: openIncidentSchema,
    },
    async (input) => asText(await tools.openIncident.invoke(input)),
  );
  server.registerTool(
    "resolve_incident",
    {
      description: "Resolve an existing incident after mitigation has been verified.",
      inputSchema: resolveIncidentSchema,
    },
    async (input) => asText(await tools.resolveIncident.invoke(input)),
  );

  return server;
};

export const startMcpServer = async (
  store: OpsStore = new SqliteOpsStore(),
): Promise<McpServer> => {
  const server = createMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("opspilot MCP server: ready (stdio)");
  return server;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startMcpServer().catch((error: unknown) => {
    console.error("opspilot MCP server failed to start:", error);
    process.exitCode = 1;
  });
}
