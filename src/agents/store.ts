import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Alert, AlertStatus, Incident, IncidentFilter, Runbook, Service, Severity } from "./types.js";
import { DomainError, type OpsStore, type OpsStoreSnapshot, type StoreSnapshot as SharedStoreSnapshot } from "../store/ops-store.js";
export { DomainError } from "../store/ops-store.js";

export type StoreSnapshot = SharedStoreSnapshot;

const serviceSchema = z.object({ id: z.string(), name: z.string(), description: z.string().optional(), tier: z.enum(["tier1", "tier2", "tier3"]).optional() });
const alertSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["firing", "resolved"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
  summary: z.string().optional(),
});
const incidentSchema = z.object({
  id: z.string(),
  title: z.string(),
  serviceId: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "resolved"]),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
});
const snapshotSchema = z.object({
  services: z.array(serviceSchema),
  alerts: z.array(alertSchema),
  incidents: z.array(incidentSchema).default([]),
});

const clone = <T>(snapshot: T): T => structuredClone(snapshot);

export const readSeedFile = (seedPath = resolve(process.cwd(), "data", "seed.json")): StoreSnapshot => {
  const parsed: unknown = JSON.parse(readFileSync(seedPath, "utf8"));
  return snapshotSchema.parse(parsed);
};

export class InMemoryStore implements OpsStore {
  private snapshot: OpsStoreSnapshot = { services: [], alerts: [], incidents: [], runbooks: [] };

  reset(seed: StoreSnapshot = readSeedFile()): OpsStoreSnapshot {
    this.snapshot = {
      ...clone(seed),
      runbooks: [
        { id: "runbook-checkout", service: "checkout", content: "Verifique erros de checkout, dependências de pagamentos e a taxa de conversão antes de mitigar.", updatedAt: "2026-09-09T00:00:00.000Z" },
        { id: "runbook-payments", service: "payments", content: "Verifique timeouts, saúde dos provedores e filas de retry antes de reprocessar pagamentos.", updatedAt: "2026-09-09T00:00:00.000Z" },
        { id: "runbook-auth", service: "auth", content: "Verifique autenticação, expiração de tokens e disponibilidade do provedor de identidade.", updatedAt: "2026-09-09T00:00:00.000Z" },
      ],
    };
    return this.read();
  }

  read(): OpsStoreSnapshot {
    return clone(this.snapshot);
  }

  listAlerts(status?: AlertStatus): Alert[] {
    return this.snapshot.alerts
      .filter((alert) => status === undefined || alert.status === status)
      .map((alert) => ({ ...alert }));
  }

  openIncident(title: string, service: string, severity: Severity): Incident {
    const normalizedService = service.toLowerCase() === "payment" ? "payments" : service;
    const matchedService = this.snapshot.services.find((item) => item.name === normalizedService || item.id === normalizedService);
    if (!matchedService) throw new DomainError(`Service not found: ${service}`, "SERVICE_NOT_FOUND");
    const incident: Incident = {
      id: `inc-${String(this.snapshot.incidents.length + 1).padStart(3, "0")}`,
      title,
      serviceId: matchedService.id,
      severity,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.snapshot.incidents.push(incident);
    return { ...incident };
  }

  listIncidents(filter: IncidentFilter = "open"): Incident[] {
    return this.snapshot.incidents
      .filter((incident) => filter === "all" || incident.status === filter)
      .map((incident) => ({ ...incident }));
  }

  resolveIncident(id: string, summary?: string): Incident {
    const incident = this.snapshot.incidents.find((item) => item.id === id);
    if (!incident) throw new DomainError(`Incident not found: ${id}`, "INCIDENT_NOT_FOUND");
    if (incident.status === "resolved") throw new DomainError(`Incident already resolved: ${id}`, "INCIDENT_ALREADY_RESOLVED");
    incident.status = "resolved";
    incident.resolvedAt = new Date().toISOString();
    incident.summary = summary;
    return { ...incident };
  }

  consultRunbook(service: string): Runbook {
    const normalized = service.toLowerCase();
    const runbook = this.snapshot.runbooks.find((item) => item.service === normalized);
    if (!runbook) throw new DomainError(`Runbook not found: ${service}`, "RUNBOOK_NOT_FOUND");
    return { ...runbook };
  }

  close(): void {}
}

export const createSeededStore = (seedPath?: string): InMemoryStore => {
  const store = new InMemoryStore();
  store.reset(readSeedFile(seedPath));
  return store;
};
