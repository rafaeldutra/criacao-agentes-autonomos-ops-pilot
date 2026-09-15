import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createSeededStore } from "./store.js";
import type { AlertStatus, IncidentFilter, Severity } from "./types.js";
import type { OpsStore } from "../store/ops-store.js";

export const alertStatusSchema = z.enum(["firing", "resolved"]).describe("Alert lifecycle status to include.");
export const severitySchema = z.enum(["low", "medium", "high", "critical"]).describe("Incident severity.");
export const incidentFilterSchema = z.enum(["open", "resolved", "all"]).default("open").describe("Incident statuses to list.");
export const listAlertsSchema = z.object({ status: alertStatusSchema.optional().describe("Optional alert status filter.") });
export const openIncidentSchema = z.object({
  title: z.string().min(1).describe("Short operational title for the incident."),
  service: z.string().min(1).describe("Service name or id affected by the incident."),
  severity: severitySchema,
});
export const resolveIncidentSchema = z.object({
  id: z.string().min(1).describe("Incident id returned by open_incident or list_incidents."),
  summary: z.string().min(1).optional().describe("Optional resolution summary."),
});
export const listIncidentsSchema = z.object({ status: incidentFilterSchema });
export const consultRunbookSchema = z.object({
  service: z.string().min(1).describe("Service whose operational runbook should be consulted."),
});

export const createTools = (store: OpsStore = createSeededStore()) => ({
  listAlerts: tool(
    (input) => store.listAlerts(input.status as AlertStatus | undefined),
    { name: "list_alerts", description: "List production alerts, optionally filtered by status.", schema: listAlertsSchema },
  ),
  openIncident: tool(
    (input) => store.openIncident(input.title, input.service, input.severity as Severity),
    { name: "open_incident", description: "Open an incident for a service.", schema: openIncidentSchema },
  ),
  resolveIncident: tool(
    (input) => store.resolveIncident(input.id, input.summary),
    { name: "resolve_incident", description: "Resolve an existing incident after mitigation has been verified.", schema: resolveIncidentSchema },
  ),
  listIncidents: tool(
    (input) => store.listIncidents(input.status as IncidentFilter),
    { name: "list_incidents", description: "List operational incidents; use open by default and all only when a complete history is needed.", schema: listIncidentsSchema },
  ),
  consultRunbook: tool(
    (input) => store.consultRunbook(input.service),
    { name: "consultar_runbook", description: "Consult the service runbook before diagnosing or mitigating a known operational issue.", schema: consultRunbookSchema },
  ),
});

export type AgentTools = ReturnType<typeof createTools>;
