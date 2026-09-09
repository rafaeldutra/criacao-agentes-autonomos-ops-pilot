import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { Alert, AlertStatus, Incident, Service, Severity } from "./types.js";

export class DomainError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "DomainError";
  }
}

export type StoreSnapshot = {
  services: Service[];
  alerts: Alert[];
  incidents: Incident[];
};

const serviceSchema = z.object({ id: z.string(), name: z.string(), description: z.string().optional() });
const alertSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  status: z.enum(["firing", "resolved"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  title: z.string(),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
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

const clone = (snapshot: StoreSnapshot): StoreSnapshot => structuredClone(snapshot);

export const readSeedFile = (seedPath = resolve(process.cwd(), "data", "seed.json")): StoreSnapshot => {
  const parsed: unknown = JSON.parse(readFileSync(seedPath, "utf8"));
  return snapshotSchema.parse(parsed);
};

export class InMemoryStore {
  private snapshot: StoreSnapshot = { services: [], alerts: [], incidents: [] };

  reset(seed: StoreSnapshot = readSeedFile()): StoreSnapshot {
    this.snapshot = clone(seed);
    return this.read();
  }

  read(): StoreSnapshot {
    return clone(this.snapshot);
  }

  listAlerts(status?: AlertStatus): Alert[] {
    return this.snapshot.alerts
      .filter((alert) => status === undefined || alert.status === status)
      .map((alert) => ({ ...alert }));
  }

  openIncident(title: string, service: string, severity: Severity): Incident {
    const matchedService = this.snapshot.services.find((item) => item.name === service || item.id === service);
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

  resolveIncident(id: string): Incident {
    const incident = this.snapshot.incidents.find((item) => item.id === id);
    if (!incident) throw new DomainError(`Incident not found: ${id}`, "INCIDENT_NOT_FOUND");
    if (incident.status === "resolved") throw new DomainError(`Incident already resolved: ${id}`, "INCIDENT_ALREADY_RESOLVED");
    incident.status = "resolved";
    incident.resolvedAt = new Date().toISOString();
    return { ...incident };
  }
}

export const createSeededStore = (seedPath?: string): InMemoryStore => {
  const store = new InMemoryStore();
  store.reset(readSeedFile(seedPath));
  return store;
};
