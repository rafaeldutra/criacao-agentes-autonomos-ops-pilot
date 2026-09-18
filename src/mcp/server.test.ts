import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createSeededStore } from "../agents/store.js";
import {
  listAlertsSchema,
  openIncidentSchema,
  resolveIncidentSchema,
} from "../agents/tools.js";
import { createMcpServer, MCP_SERVER_DESCRIPTION } from "./server.js";

const connectTestServer = async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const store = createSeededStore();
  const server = createMcpServer(store);
  const client = new Client({ name: "ops-pilot-test-client", version: "1.0.0" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server, store };
};

const parseTextResult = (result: unknown) => {
  if (typeof result !== "object" || result === null || !("content" in result) || !Array.isArray(result.content)) {
    throw new Error("MCP result did not contain text content");
  }
  const first = result.content[0];
  if (typeof first !== "object" || first === null || !("type" in first) || first.type !== "text" || !("text" in first) || typeof first.text !== "string") {
    throw new Error("MCP result did not contain text content");
  }
  return JSON.parse(first.text);
};

test("MCP server identifies as opspilot and lists exactly its three tools", async () => {
  const { client, server } = await connectTestServer();
  try {
    assert.deepEqual(client.getServerVersion(), {
      name: "opspilot",
      version: "1.0.0",
    });
    assert.match(MCP_SERVER_DESCRIPTION, /alert.*incident/i);

    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name), [
      "list_alerts",
      "open_incident",
      "resolve_incident",
    ]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP tools reuse the operational schemas and shared store behavior", async () => {
  const { client, server } = await connectTestServer();
  try {
    const result = await client.listTools();
    const byName = new Map(result.tools.map((tool) => [tool.name, tool]));
    assert.deepEqual(byName.get("list_alerts")?.inputSchema.properties, listAlertsSchema.toJSONSchema().properties);
    assert.deepEqual(byName.get("open_incident")?.inputSchema.properties, openIncidentSchema.toJSONSchema().properties);
    assert.deepEqual(byName.get("resolve_incident")?.inputSchema.properties, resolveIncidentSchema.toJSONSchema().properties);

    const opened = await client.callTool({
      name: "open_incident",
      arguments: { title: "Checkout outage", service: "checkout", severity: "high" },
    });
    const openedIncident = parseTextResult(opened);
    assert.equal(openedIncident.status, "open");

    const resolved = await client.callTool({
      name: "resolve_incident",
      arguments: { id: openedIncident.id, summary: "Mitigation verified" },
    });
    const resolvedIncident = parseTextResult(resolved);
    assert.equal(resolvedIncident.status, "resolved");
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP rejects invalid input without mutating the store", async () => {
  const { client, server, store } = await connectTestServer();
  try {
    const result = await client.callTool({
      name: "open_incident",
      arguments: { title: "", service: "checkout", severity: "high" },
    });
    assert.equal(result.isError, true);
    assert.equal(store.read().incidents.length, 0);
    const alerts = await client.callTool({ name: "list_alerts", arguments: { status: "firing" } });
    assert.equal(alerts.isError, undefined);
  } finally {
    await client.close();
    await server.close();
  }
});

test("MCP launch configuration keeps stdout reserved for protocol messages", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };
  const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
  assert.equal(packageJson.scripts?.mcp, "tsx src/mcp/server.ts");
  assert.equal(source.includes("console.log"), false);
  assert.match(source, /console\.error/);
});
