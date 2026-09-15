import type {
  Alert,
  AlertStatus,
  Incident,
  IncidentFilter,
  Runbook,
  Service,
  Severity,
} from "../agents/types.js";

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

export type OpsStoreSnapshot = StoreSnapshot & { runbooks: Runbook[] };

export interface OpsStore {
  read(): OpsStoreSnapshot;
  listAlerts(status?: AlertStatus): Alert[];
  openIncident(title: string, service: string, severity: Severity): Incident;
  listIncidents(filter?: IncidentFilter): Incident[];
  resolveIncident(id: string, summary?: string): Incident;
  consultRunbook(service: string): Runbook;
  close(): void;
}
