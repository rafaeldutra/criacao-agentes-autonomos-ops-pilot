import { DatabaseSync } from "node:sqlite";
import type { ContextBreakdown, StrategyRoute, TraceEvent } from "../agents/types.js";
import type { RequestDetail, RequestRecordInput, RequestStore, RequestSummary } from "./request-store.js";

const DEFAULT_PATH = "./data/opspilot.db";

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS requests (
  request_id       TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL,
  conversation_id  TEXT,
  user_id          TEXT,
  route            TEXT CHECK (route IN ('react', 'plan-and-execute', 'reflect')),
  reflect          INTEGER CHECK (reflect IN (0, 1)),
  status           INTEGER NOT NULL CHECK (status BETWEEN 100 AND 599),
  error_code       TEXT,
  latency_ms       INTEGER NOT NULL CHECK (latency_ms >= 0),
  llm_calls        INTEGER CHECK (llm_calls >= 0),
  prompt_tokens    INTEGER CHECK (prompt_tokens >= 0),
  model_used       TEXT,
  history_messages INTEGER CHECK (history_messages >= 0),
  memory_facts     INTEGER CHECK (memory_facts >= 0),
  context_breakdown TEXT
);
CREATE INDEX IF NOT EXISTS idx_requests_conversation_created
  ON requests(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_created
  ON requests(created_at);
CREATE TABLE IF NOT EXISTS trace_events (
  request_id TEXT NOT NULL REFERENCES requests(request_id),
  seq        INTEGER NOT NULL CHECK (seq >= 0),
  node       TEXT,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  PRIMARY KEY (request_id, seq)
);
`;

const nullable = <T>(value: T | undefined): T | null => (value === undefined ? null : value);

/** Payload is the event without the columns stored separately. */
const toPayload = (event: TraceEvent): string => {
  const { type: _type, node: _node, ...rest } = event;
  return JSON.stringify(rest);
};

const toEvent = (row: Record<string, unknown>): TraceEvent => ({
  type: String(row.type),
  ...(row.node === null || row.node === undefined ? {} : { node: String(row.node) }),
  ...(JSON.parse(String(row.payload)) as Record<string, unknown>),
}) as TraceEvent;

/** Columns added after the first release; CREATE TABLE IF NOT EXISTS skips them on existing files. */
const migrate = (db: DatabaseSync): void => {
  const columns = db.prepare("PRAGMA table_info(requests)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "context_breakdown")) {
    db.exec("ALTER TABLE requests ADD COLUMN context_breakdown TEXT");
  }
};

const numberOrNull = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const stringOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

export class SqliteRequestStore implements RequestStore {
  readonly db: DatabaseSync;

  constructor(path = process.env.OPSPILOT_DB || DEFAULT_PATH) {
    if (!path.trim()) throw new Error("OPSPILOT_DB must not be empty");
    this.db = new DatabaseSync(path);
    this.db.exec(schema);
    migrate(this.db);
  }

  record(input: RequestRecordInput): void {
    const insertRequest = this.db.prepare(
      `INSERT INTO requests (
         request_id, created_at, conversation_id, user_id, route, reflect, status, error_code,
         latency_ms, llm_calls, prompt_tokens, model_used, history_messages, memory_facts, context_breakdown
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertEvent = this.db.prepare(
      "INSERT INTO trace_events (request_id, seq, node, type, payload) VALUES (?, ?, ?, ?, ?)",
    );

    this.db.exec("BEGIN");
    try {
      insertRequest.run(
        input.requestId,
        input.createdAt,
        nullable(input.conversationId),
        nullable(input.userId),
        nullable(input.route),
        input.reflect === undefined ? null : input.reflect ? 1 : 0,
        input.status,
        nullable(input.errorCode),
        input.latencyMs,
        nullable(input.metrics?.llmCalls),
        nullable(input.metrics?.promptTokens),
        nullable(input.metrics?.modelUsed),
        nullable(input.metrics?.historyMessages),
        nullable(input.metrics?.memoryFacts),
        input.metrics?.contextBreakdown ? JSON.stringify(input.metrics.contextBreakdown) : null,
      );
      input.trace.forEach((event, seq) => {
        insertEvent.run(input.requestId, seq, nullable(event.node), nullable(event.type), toPayload(event));
      });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  get(requestId: string): RequestDetail | undefined {
    const row = this.db
      .prepare(
        `SELECT request_id, created_at, conversation_id, user_id, route, reflect, status, error_code,
                latency_ms, llm_calls, prompt_tokens, model_used, history_messages, memory_facts, context_breakdown
         FROM requests WHERE request_id = ?`,
      )
      .get(requestId) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    const events = this.db
      .prepare("SELECT node, type, payload FROM trace_events WHERE request_id = ? ORDER BY seq ASC")
      .all(requestId) as Array<Record<string, unknown>>;

    const hasMetrics = [
      row.llm_calls,
      row.prompt_tokens,
      row.model_used,
      row.history_messages,
      row.memory_facts,
      row.context_breakdown,
    ].some((value) => value !== null && value !== undefined);

    return {
      requestId: String(row.request_id),
      createdAt: String(row.created_at),
      conversationId: stringOrNull(row.conversation_id),
      userId: stringOrNull(row.user_id),
      route: stringOrNull(row.route) as StrategyRoute | null,
      reflect: row.reflect === null || row.reflect === undefined ? null : Number(row.reflect) === 1,
      status: Number(row.status),
      errorCode: stringOrNull(row.error_code),
      latencyMs: Number(row.latency_ms),
      metrics: hasMetrics
        ? {
            llmCalls: numberOrNull(row.llm_calls),
            promptTokens: numberOrNull(row.prompt_tokens),
            modelUsed: stringOrNull(row.model_used),
            historyMessages: numberOrNull(row.history_messages),
            memoryFacts: numberOrNull(row.memory_facts),
            contextBreakdown:
              row.context_breakdown === null || row.context_breakdown === undefined
                ? null
                : (JSON.parse(String(row.context_breakdown)) as ContextBreakdown),
          }
        : null,
      trace: events.map(toEvent),
    };
  }

  listSince(sinceIso: string): RequestSummary[] {
    const rows = this.db
      .prepare(
        `SELECT created_at, route, status, latency_ms, prompt_tokens, model_used
         FROM requests WHERE created_at >= ? ORDER BY created_at ASC`,
      )
      .all(sinceIso) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      createdAt: String(row.created_at),
      route: stringOrNull(row.route) as StrategyRoute | null,
      status: Number(row.status),
      latencyMs: Number(row.latency_ms),
      promptTokens: numberOrNull(row.prompt_tokens),
      modelUsed: stringOrNull(row.model_used),
    }));
  }

  close(): void {
    this.db.close();
  }
}
