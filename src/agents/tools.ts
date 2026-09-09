import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createSeededStore, InMemoryStore } from "./store.js";
import type { AlertStatus, Severity } from "./types.js";

export const alertStatusSchema = z.enum(["firing", "resolved"]);
export const severitySchema = z.enum(["low", "medium", "high", "critical"]);
export const listAlertsSchema = z.object({ status: alertStatusSchema.optional() });
export const openIncidentSchema = z.object({
  title: z.string().min(1),
  service: z.string().min(1),
  severity: severitySchema,
});
export const resolveIncidentSchema = z.object({ id: z.string().min(1) });

export const createTools = (store: InMemoryStore = createSeededStore()) => ({
  listAlerts: tool(
    (input) => store.listAlerts(input.status as AlertStatus | undefined),
    { name: "list_alerts", description: "List production alerts, optionally filtered by status.", schema: listAlertsSchema },
  ),
  openIncident: tool(
    (input) => store.openIncident(input.title, input.service, input.severity as Severity),
    { name: "open_incident", description: "Open an incident for a service.", schema: openIncidentSchema },
  ),
  resolveIncident: tool(
    (input) => store.resolveIncident(input.id),
    { name: "resolve_incident", description: "Resolve an existing incident by id.", schema: resolveIncidentSchema },
  ),
});

export type AgentTools = ReturnType<typeof createTools>;
