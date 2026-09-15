import { DatabaseSync } from "node:sqlite";
import { readSeedFile } from "../agents/store.js";
import type {
  Alert,
  AlertStatus,
  Incident,
  IncidentFilter,
  Runbook,
  Service,
  Severity,
} from "../agents/types.js";
import { DomainError, type OpsStore, type OpsStoreSnapshot } from "./ops-store.js";

const DEFAULT_PATH = "./data/opspilot.db";
const RUNBOOK_SEED: readonly Runbook[] = [
  { id: "runbook-checkout", service: "checkout", content: "Verifique erros de checkout, dependências de pagamentos e a taxa de conversão antes de mitigar.", updatedAt: "2026-09-09T00:00:00.000Z" },
  { id: "runbook-payments", service: "payments", content: "Verifique timeouts, saúde dos provedores e filas de retry antes de reprocessar pagamentos.", updatedAt: "2026-09-09T00:00:00.000Z" },
  { id: "runbook-auth", service: "auth", content: "Verifique autenticação, expiração de tokens e disponibilidade do provedor de identidade.", updatedAt: "2026-09-09T00:00:00.000Z" },
];

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  tier TEXT NOT NULL DEFAULT 'tier2' CHECK (tier IN ('tier1', 'tier2', 'tier3'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL REFERENCES services(id),
  status TEXT NOT NULL CHECK (status IN ('firing', 'resolved')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK ((status = 'resolved' AND resolved_at IS NOT NULL) OR (status = 'firing' AND resolved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  service_id TEXT NOT NULL REFERENCES services(id),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  summary TEXT,
  CHECK ((status = 'resolved' AND resolved_at IS NOT NULL) OR (status = 'open' AND resolved_at IS NULL))
);
CREATE TABLE IF NOT EXISTS runbooks (
  id TEXT PRIMARY KEY,
  service TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
`;

const serviceName = (value: string): string => value.toLowerCase() === "payment" ? "payments" : value.toLowerCase();
const optional = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

export class SqliteOpsStore implements OpsStore {
  readonly db: DatabaseSync;

  constructor(path = process.env.OPSPILOT_DB || DEFAULT_PATH) {
    if (!path.trim()) throw new Error("OPSPILOT_DB must not be empty");
    this.db = new DatabaseSync(path);
    this.db.exec(schema);
    this.seed();
  }

  seed(): void {
    const seed = readSeedFile();
    const insertService = this.db.prepare("INSERT INTO services (id, name, description, tier) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description");
    const insertAlert = this.db.prepare("INSERT INTO alerts (id, service_id, status, severity, title, created_at, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET service_id = excluded.service_id, status = excluded.status, severity = excluded.severity, title = excluded.title, created_at = excluded.created_at, resolved_at = excluded.resolved_at");
    const insertRunbook = this.db.prepare("INSERT INTO runbooks (id, service, content, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET service = excluded.service, content = excluded.content, updated_at = excluded.updated_at");
    for (const service of seed.services) insertService.run(service.id, service.name, service.description ?? null, service.tier ?? "tier2");
    for (const alert of seed.alerts) insertAlert.run(alert.id, alert.serviceId, alert.status, alert.severity, alert.title, alert.createdAt, alert.resolvedAt ?? null);
    for (const runbook of RUNBOOK_SEED) insertRunbook.run(runbook.id, runbook.service, runbook.content, runbook.updatedAt);
  }

  read(): OpsStoreSnapshot {
    return {
      services: this.rows<Service>("SELECT id, name, description, tier FROM services ORDER BY id").map((row) => ({ ...row, description: optional(row.description) })),
      alerts: this.rows<Record<string, unknown>>("SELECT id, service_id, status, severity, title, created_at, resolved_at FROM alerts ORDER BY id").map((row) => this.alert(row)),
      incidents: this.listIncidents("all"),
      runbooks: this.rows<Record<string, unknown>>("SELECT id, service, content, updated_at FROM runbooks ORDER BY id").map((row) => this.runbook(row)),
    };
  }

  listAlerts(status?: AlertStatus): Alert[] {
    const statement = status
      ? this.db.prepare("SELECT id, service_id, status, severity, title, created_at, resolved_at FROM alerts WHERE status = ? ORDER BY created_at")
      : this.db.prepare("SELECT id, service_id, status, severity, title, created_at, resolved_at FROM alerts ORDER BY created_at");
    const rows = status ? statement.all(status) : statement.all();
    return rows.map((row) => this.alert(row as Record<string, unknown>));
  }

  openIncident(title: string, service: string, severity: Severity): Incident {
    const matched = this.db.prepare("SELECT id FROM services WHERE id = ? OR name = ?").get(serviceName(service), serviceName(service)) as { id?: string } | undefined;
    if (!matched?.id) throw new DomainError(`Service not found: ${service}`, "SERVICE_NOT_FOUND");
    const id = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    this.db.prepare("INSERT INTO incidents (id, title, service_id, severity, status, created_at, resolved_at, summary) VALUES (?, ?, ?, ?, 'open', ?, NULL, NULL)").run(id, title, matched.id, severity, createdAt);
    return this.incident(this.db.prepare("SELECT id, title, service_id, severity, status, created_at, resolved_at, summary FROM incidents WHERE id = ?").get(id) as Record<string, unknown>);
  }

  listIncidents(filter: IncidentFilter = "open"): Incident[] {
    const statement = filter === "open"
      ? this.db.prepare("SELECT id, title, service_id, severity, status, created_at, resolved_at, summary FROM incidents WHERE status = 'open' ORDER BY created_at DESC")
      : filter === "resolved"
        ? this.db.prepare("SELECT id, title, service_id, severity, status, created_at, resolved_at, summary FROM incidents WHERE status = 'resolved' ORDER BY created_at DESC")
        : this.db.prepare("SELECT id, title, service_id, severity, status, created_at, resolved_at, summary FROM incidents ORDER BY created_at DESC");
    return statement.all().map((row) => this.incident(row as Record<string, unknown>));
  }

  resolveIncident(id: string, summary?: string): Incident {
    const existing = this.db.prepare("SELECT status FROM incidents WHERE id = ?").get(id) as { status?: string } | undefined;
    if (!existing) throw new DomainError(`Incident not found: ${id}`, "INCIDENT_NOT_FOUND");
    if (existing.status === "resolved") throw new DomainError(`Incident already resolved: ${id}`, "INCIDENT_ALREADY_RESOLVED");
    const resolvedAt = new Date().toISOString();
    this.db.prepare("UPDATE incidents SET status = 'resolved', resolved_at = ?, summary = ? WHERE id = ? AND status = 'open'").run(resolvedAt, summary ?? null, id);
    return this.incident(this.db.prepare("SELECT id, title, service_id, severity, status, created_at, resolved_at, summary FROM incidents WHERE id = ?").get(id) as Record<string, unknown>);
  }

  consultRunbook(service: string): Runbook {
    const row = this.db.prepare("SELECT id, service, content, updated_at FROM runbooks WHERE service = ?").get(serviceName(service)) as Record<string, unknown> | undefined;
    if (!row) throw new DomainError(`Runbook not found: ${service}`, "RUNBOOK_NOT_FOUND");
    return this.runbook(row);
  }

  close(): void {
    this.db.close();
  }

  private rows<T>(sql: string): T[] {
    return this.db.prepare(sql).all() as T[];
  }

  private alert(row: Record<string, unknown>): Alert {
    return { id: String(row.id), serviceId: String(row.service_id), status: row.status as AlertStatus, severity: row.severity as Severity, title: String(row.title), createdAt: String(row.created_at), resolvedAt: optional(row.resolved_at) };
  }

  private incident(row: Record<string, unknown>): Incident {
    return { id: String(row.id), title: String(row.title), serviceId: String(row.service_id), severity: row.severity as Severity, status: row.status as "open" | "resolved", createdAt: String(row.created_at), resolvedAt: optional(row.resolved_at), summary: optional(row.summary) };
  }

  private runbook(row: Record<string, unknown>): Runbook {
    return { id: String(row.id), service: String(row.service), content: String(row.content), updatedAt: String(row.updated_at) };
  }
}
