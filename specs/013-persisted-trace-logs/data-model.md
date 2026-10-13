# Data Model: Trace Persistido e Logs Estruturados

## SQLite (DDL idempotente em `SqliteRequestStore`)

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS requests (
  request_id       TEXT PRIMARY KEY,
  created_at       TEXT NOT NULL,                 -- ISO 8601, início da requisição
  conversation_id  TEXT,                          -- sem FK: pode não existir (404)
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
  context_breakdown TEXT                          -- JSON {memory,history,message,summary}, estimado
);
-- Bancos criados antes da coluna: ALTER TABLE requests ADD COLUMN context_breakdown TEXT
-- (aplicado no construtor quando PRAGMA table_info não a encontra).
CREATE INDEX IF NOT EXISTS idx_requests_conversation_created
  ON requests(conversation_id, created_at);
CREATE TABLE IF NOT EXISTS trace_events (
  request_id TEXT NOT NULL REFERENCES requests(request_id),
  seq        INTEGER NOT NULL CHECK (seq >= 0),
  node       TEXT,
  type       TEXT NOT NULL,
  payload    TEXT NOT NULL,                       -- JSON do evento sem type/node
  PRIMARY KEY (request_id, seq)
);
```

## Tipos (`src/store/request-store.ts`)

### `RequestRecordInput` (escrita)

| Campo | Tipo | Regra |
|-------|------|-------|
| `requestId` | `string` | UUID gerado pelo servidor |
| `createdAt` | `string` | ISO 8601 |
| `conversationId` | `string?` | resposta 200 ou `conversationId` do corpo |
| `userId` | `string?` | do corpo validado |
| `route` | `StrategyRoute?` | só em 200 |
| `reflect` | `boolean?` | do corpo validado |
| `status` | `number` | `response.statusCode` |
| `errorCode` | `string?` | `code` do corpo de erro; `INVALID_JSON`, `VALIDATION_ERROR`, `UNKNOWN_STRATEGY`, `CHAT_TIMEOUT` e `INTERNAL_ERROR` nos casos sem `code` hoje |
| `latencyMs` | `number` | inteiro ≥ 0 (R6) |
| `metrics` | `Pick<Metrics, "llmCalls" \| "promptTokens" \| "modelUsed" \| "historyMessages" \| "memoryFacts" \| "contextBreakdown">?` | só em 200 |
| `trace` | `TraceEvent[]` | `[]` em erro; em 200, idêntico a `body.trace` |

### `RequestDetail` (leitura)

`RequestRecordInput` com os campos ausentes normalizados para `null` e
`trace: TraceEvent[]` reconstruído como `{ type, ...(node ? { node } : {}), ...JSON.parse(payload) }`
em ordem crescente de `seq`. Ida e volta: `get(record(x).requestId).trace`
deve ser `deepEqual` a `x.trace`.

### `RequestStore`

```ts
interface RequestStore {
  record(input: RequestRecordInput): void;   // atômico; lança em erro
  get(requestId: string): RequestDetail | undefined;
  close(): void;
}
```

`REQUEST_NOT_FOUND = "REQUEST_NOT_FOUND"` exportado ao lado da interface, junto
com `getRequestOrThrow(store, requestId): RequestDetail`, que lança
`new DomainError(\`Request not found: ${requestId}\`, REQUEST_NOT_FOUND)` quando
`store.get` devolve `undefined`. A borda HTTP traduz esse erro em 404.

### `ChatOutcome` (`response.locals.chatOutcome`, preenchido pela borda)

`{ conversationId?, userId?, reflect?, route?, metrics?, trace?, errorCode? }`.
Uma função pura `toRequestRecord(requestId, startedAt, latencyMs, status, outcome)`
monta o `RequestRecordInput`.

### Início da requisição (`response.locals`, preenchido por `requestIdMiddleware`)

`requestId` (UUID), `startedAt` (ISO 8601) e `startedAtMs` (`performance.now()`).
São a única fonte de início: `latency_ms` persistido e `latencyMs` do
`request.end` saem da mesma subtração e coincidem.

## Log (`src/obs/logger.ts`)

### `LogEntry`

| Campo | Tipo | Regra |
|-------|------|-------|
| `ts` | `string` | ISO 8601 |
| `level` | `"info" \| "warn" \| "error"` | |
| `event` | `string` | ver tabela de eventos em `contracts/logging.md` |
| `requestId` | `string?` | presente em todo evento de requisição |
| demais | `string \| number \| boolean \| null` | só primitivos; `undefined` é omitido |

### `traceEventMeta(event, seq)` (lista branca)

| `type` | campos além de `seq`, `node`, `type` |
|--------|--------------------------------------|
| `thought`, `observation`, `critique`, `answer`, `summarize` | `chars` |
| `action` | `tool`, `argKeys` (quantidade de chaves) |
| `plan` | `steps` |
| `route` | `route` |
| `fallback` | `fromModel`, `toModel` |
