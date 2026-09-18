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

export const providerSchema = z.enum(["github", "cloudflare"]).default("github").describe(
  "Provider externo a consultar quando houver suspeita de incidente fora do OpsPilot; ajuda a distinguir falha local de indisponibilidade de uma dependencia.",
);
export const checkProviderStatusSchema = z.object({ provider: providerSchema });

const providerStatusSchema = z.object({
  status: z.object({
    indicator: z.string().trim().min(1),
    description: z.string().trim().min(1),
  }),
});

const statusUrls = {
  github: "https://www.githubstatus.com/api/v2/status.json",
  cloudflare: "https://www.cloudflarestatus.com/api/v2/status.json",
} as const;

export type Provider = keyof typeof statusUrls;
export type ProviderFetch = typeof fetch;

type ToolOptions = {
  fetch?: ProviderFetch;
};

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const isRetryableError = (error: unknown) => error instanceof Error && (
  error.name === "AbortError" || error.name === "TimeoutError"
);

export async function fetchProviderStatus(provider: Provider, doFetch: ProviderFetch = fetch): Promise<string> {
  let lastError: unknown = new Error("unknown provider status failure");

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let responseReceived = false;
    try {
      const response = await doFetch(statusUrls[provider], { signal: AbortSignal.timeout(5000) });
      responseReceived = true;
      if (response.status >= 500) {
        throw new Error(`upstream HTTP ${response.status}`);
      }
      if (!response.ok) {
        return `${provider} status check failed: HTTP ${response.status}`;
      }

      const payload = providerStatusSchema.parse(await response.json());
      const indicator = payload.status.indicator.replace(/\s+/g, " ");
      const description = payload.status.description.replace(/\s+/g, " ");
      return `${provider}: ${indicator} - ${description}`;
    } catch (error) {
      lastError = error;
      if (attempt === 1 && (!responseReceived || isRetryableError(error) || (error instanceof Error && error.message.startsWith("upstream HTTP 5")))) {
        continue;
      }
      return `${provider} status check failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${errorMessage(error).replace(/\s+/g, " ")}`;
    }
  }

  return `${provider} status check failed: ${errorMessage(lastError).replace(/\s+/g, " ")}`;
}

export const createTools = (store: OpsStore = createSeededStore(), options: ToolOptions = {}) => ({
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
  checkProviderStatus: tool(
    (input) => fetchProviderStatus(input.provider, options.fetch),
    {
      name: "check_provider_status",
      description: "Check whether GitHub or Cloudflare has an external outage when an incident may be caused by a dependency outside the organization.",
      schema: checkProviderStatusSchema,
    },
  ),
});

export type AgentTools = ReturnType<typeof createTools>;
