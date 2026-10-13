---
description: "Tarefas de implementação do trace persistido e logs estruturados do OpsPilot"
---

# Tasks: Trace Persistido e Logs Estruturados

**Input**: Design documents from `/specs/013-persisted-trace-logs/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluídos — FR-015 exige testes determinísticos (`requestId` em header e corpo, persistência e trace ordenado, `GET /requests/:id` 200/404/400, isolamento de falha de persistência, ausência de conteúdo nos logs); constituição exige teste para lógica nova.

**Organization**: Tasks por user story. Logger em `src/obs/logger.ts`; persistência em `src/store/request-store.ts` + `sqlite-request-store.ts` + `fake-request-store.ts`; borda HTTP em `src/http/request-trace.ts` e `src/http/server.ts`; composição em `src/index.ts`. Testes usam `FakeRequestStore` ou `SqliteRequestStore(":memory:")` e um logger com destino capturado — nunca o `OPSPILOT_DB` padrão nem `.env`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]–[US4] mapeiam as stories da spec
- Sempre incluir caminho de arquivo na descrição

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirmar a base da 012 e os alvos, sem mudar comportamento.

- [X] T001 Verify baseline from `specs/013-persisted-trace-logs/plan.md`: feature 012 merged (`TraceEvent` variant `fallback` and `Metrics.modelUsed` in `src/agents/types.ts`, 503 `MODEL_SERVICE_UNAVAILABLE` in `src/http/server.ts`), `npm run typecheck` and `npm run test` green; note the existing store pattern in `src/store/sqlite-conversation-store.ts` (DDL idempotente, prepared statements, `OPSPILOT_DB` default, `close()`) to mirror in the new store

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Logger estruturado básico injetável na `createApp`, usado por todas as stories (inclusive `request.persist_failed` da US2).

**⚠️ CRITICAL**: Nenhuma user story começa antes desta fase.

- [X] T002 Create `src/obs/logger.ts` exporting `LogLevel`, `LogFields` (`Record<string, string | number | boolean | null | undefined>`), `Logger` (`Record<LogLevel, (event: string, fields?: LogFields) => void>`), pure `formatLogLine(entry)` (`JSON.stringify` in one line, `undefined` fields omitted, no `"\n"` inside), pure `errorMeta(error)` (`errorName`, `errorMessage` = first line of the message truncated to 200 chars, never the stack) and `createLogger({ out?, err?, now? })` writing `formatLogLine(...) + "\n"` with `info` → `out` (default `process.stdout.write`) and `warn`/`error` → `err` (default `process.stderr.write`), per `specs/013-persisted-trace-logs/contracts/logging.md`
- [X] T003 [P] Create `src/obs/test-logger.ts` exporting `createCapturingLogger()` → `{ logger, lines: string[], entries(): Record<string, unknown>[] }` built on `createLogger({ out, err, now: () => new Date("2026-10-13T00:00:00.000Z") })`, for deterministic assertions in tests
- [X] T004 [P] Add tests in `src/obs/logger.test.ts`: `formatLogLine` output is a single line that `JSON.parse`s back to the entry with `undefined` keys removed; `createLogger` routes `info` to `out` and `warn`/`error` to `err` with injected `ts`; `errorMeta` keeps only the first line, caps at 200 chars, omits stack, handles non-`Error` values
- [X] T005 Add `logger?: Logger` to `ChatServerOptions` in `src/http/server.ts` (default `createLogger()`), and replace `console.error("[http]", error)` with `logger.error("http.error", errorMeta(error))` and `console.error("[history-summarizer]", error)` with `logger.error("history_summary.failed", { conversationId, ...errorMeta(error) })`; in `src/http/server.test.ts`, route every existing `createApp(...)` call through a local helper that injects `createCapturingLogger().logger` by default (overridable per test), so the suite emits no log lines on stdout/stderr; existing tests stay green

**Checkpoint**: Logger disponível e injetável; nenhum `console.*` restante em `src/http/server.ts`.

---

## Phase 3: User Story 1 - Identificador único por requisição de chat (Priority: P1) 🎯 MVP

**Goal**: Toda resposta de `POST /chat` (sucesso e todos os erros) traz `X-Request-Id` e `requestId` idênticos, gerados pelo servidor.

**Independent Test**: `POST /chat` válido → header `X-Request-Id` presente, UUID, igual a `body.requestId`; dois POSTs → ids distintos; cada caminho de erro também traz os dois.

### Tests for User Story 1 ⚠️

> Escrever primeiro e confirmar que falham.

- [X] T006 [P] [US1] Create `src/http/request-trace.test.ts` with tests for pure `withRequestId(requestId, body)`: returns `{ requestId, ...body }` without mutating `body` and keeps `error`/`code`/`issues` intact
- [X] T007 [P] [US1] Add tests in `src/http/server.test.ts`: on 200 the `X-Request-Id` header is a UUID equal to `body.requestId`; same for 400 invalid JSON, 400 Zod, 404 `CONVERSATION_NOT_FOUND`, 422 unknown strategy, 502 `ROUTER_FAILED`, 502 `PROVIDER_ERROR`, 503 `MODEL_SERVICE_UNAVAILABLE`, 504 timeout and 500 unexpected error (existing `error`/`code`/`issues` fields unchanged); two consecutive POSTs yield different ids; a client-sent `X-Request-Id` is ignored; update the existing 503 `deepEqual` to include `requestId`

### Implementation for User Story 1

- [X] T008 [US1] Create `src/http/request-trace.ts` exporting pure `withRequestId` and `requestIdMiddleware()` that generates `randomUUID()` from `node:crypto`, stores it in `response.locals.requestId`, records the single request start in `response.locals.startedAt` (ISO 8601) and `response.locals.startedAtMs` (`performance.now()`), and sets the `X-Request-Id` header before calling `next()`
- [X] T009 [US1] Register `requestIdMiddleware()` as the first middleware in `createApp` in `src/http/server.ts`, before `express.json()`, so the 400 invalid-JSON response also gets the header
- [X] T010 [US1] Wrap every JSON body in `chatHandler` (200, 400 Zod, 404, 422, 502, 503, 504) and in `errorHandler` (400 invalid JSON, 502 `PROVIDER_ERROR`, 500) with `withRequestId(response.locals.requestId, body)` in `src/http/server.ts`; in `errorHandler` wrap only when the request path is `/chat` (other routes, e.g. `GET /requests/:id`, carry their id only in the header, per `contracts/requests-http.md`)
- [X] T011 [US1] Pass `requestId` into `runChat` in `src/http/server.ts` and include it in the `history_summary.failed` log fields; include `requestId` in the `http.error` log in `errorHandler`

**Checkpoint**: US1 completa — `requestId` presente e consistente em todas as respostas de `/chat`.

---

## Phase 4: User Story 2 - Registro persistido da requisição e do trace (Priority: P1)

**Goal**: Cada `/chat` grava, após `finish` e de forma atômica, um registro em `requests` e os eventos em `trace_events`; falhas de gravação não alteram a resposta.

**Independent Test**: `POST /chat` com `FakeRequestStore` injetada e grafo stub → `store.get(requestId)` tem status, métricas, rota e `trace` `deepEqual` a `body.trace`; erros gravam status + `errorCode` com trace vazio; store que lança não muda a resposta.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] Create `src/store/request-store.test.ts` with a shared contract suite run against both `FakeRequestStore` and `SqliteRequestStore(":memory:")`: round trip `get(id).trace` `deepEqual` to the recorded `trace` (all `TraceEvent` variants, with and without `node`, large payloads intact); order by `seq`; absent optional fields come back as `null`; `metrics` is `null` when not recorded; unknown id → `undefined`; atomicity — a record whose trace makes the insert fail mid-transaction (e.g. an event without `type`, violating `NOT NULL`) throws and `get` returns `undefined`; recording the same `requestId` twice throws; `getRequestOrThrow` returns the detail for a known id and throws `DomainError` with code `REQUEST_NOT_FOUND` for an unknown one. SQLite-only: constructing two stores on the same file path (DDL idempotent) works
- [X] T013 [P] [US2] Extend `src/http/request-trace.test.ts` with tests for pure `toRequestRecord(requestId, startedAt, latencyMs, status, outcome)`: 200 outcome maps route/reflect/metrics subset (`llmCalls`, `promptTokens`, `modelUsed`, `historyMessages`, `memoryFacts`) and trace; error outcome yields no metrics, `trace: []` and the given `errorCode`; `latencyMs` rounded to a non-negative integer
- [X] T014 [P] [US2] Add tests in `src/http/server.test.ts` injecting `FakeRequestStore`: 200 stores status, `conversationId`, `route`, `reflect`, metrics and `trace` `deepEqual` to `body.trace` (including post-graph `summarize`/`fallback` events in their position); error paths store status and `errorCode` per the table in `specs/013-persisted-trace-logs/contracts/chat-http.md` (`INVALID_JSON`, `VALIDATION_ERROR`, `CONVERSATION_NOT_FOUND`, `UNKNOWN_STRATEGY`, `ROUTER_FAILED`, `PROVIDER_ERROR`, `MODEL_SERVICE_UNAVAILABLE`, `CHAT_TIMEOUT`, `INTERNAL_ERROR`) with empty trace; a store whose `record` throws leaves status and body identical to the non-failing case and emits one `request.persist_failed` error line with the `requestId` (captured via `createCapturingLogger`)

### Implementation for User Story 2

- [X] T015 [P] [US2] Create `src/store/request-store.ts` exporting `RequestRecordInput`, `RequestMetrics` (`Pick<Metrics, "llmCalls" | "promptTokens" | "modelUsed" | "historyMessages" | "memoryFacts">`), `RequestDetail` (absent fields normalized to `null`, `metrics: RequestMetrics | null`, `trace: TraceEvent[]`), `RequestStore` (`record`, `get`, `close`), `REQUEST_NOT_FOUND` and `getRequestOrThrow(store, requestId)` throwing `DomainError(\`Request not found: ${requestId}\`, REQUEST_NOT_FOUND)` (reuse `DomainError` from `src/store/ops-store.ts`), per `specs/013-persisted-trace-logs/data-model.md`
- [X] T016 [US2] Create `src/store/sqlite-request-store.ts` (`SqliteRequestStore`, `node:sqlite` `DatabaseSync`, path default `process.env.OPSPILOT_DB ?? "./data/opspilot.db"` like `SqliteConversationStore`): idempotent DDL for `requests`, `idx_requests_conversation_created` and `trace_events` exactly as in `data-model.md`; prepared statements; `record` inside `BEGIN`/`COMMIT` with `ROLLBACK` and rethrow on error; payload = JSON of the event without `type`/`node`; `get` reads `ORDER BY seq ASC` and rebuilds `{ type, ...(node ? { node } : {}), ...JSON.parse(payload) }`; `close()`
- [X] T017 [P] [US2] Create `src/store/fake-request-store.ts` (`FakeRequestStore`) implementing the same contract in memory: `structuredClone` on write/read, all-or-nothing validation mirroring the SQLite constraints (duplicate `requestId`, missing `type`), so the shared suite in T012 passes
- [X] T018 [US2] Extend `src/http/request-trace.ts` with `ChatOutcome` type (`conversationId?`, `userId?`, `reflect?`, `route?`, `metrics?`, `trace?`, `errorCode?`), pure `toRequestRecord(...)` and `chatAuditMiddleware(store, logger)` that reads the start from `response.locals.startedAt`/`startedAtMs` (set by `requestIdMiddleware`, no second measurement), and on `response.prependOnceListener("finish", ...)` (so it runs before the `request.end` listener) builds the record from `response.statusCode` and `response.locals.chatOutcome` and calls `store.record` inside `try/catch` → `logger.error("request.persist_failed", { requestId, ...errorMeta(error) })`
- [X] T019 [US2] In `src/http/server.ts`: add `requests?: RequestStore` to `ChatServerOptions` (default `new FakeRequestStore()`); mount `app.use("/chat", chatAuditMiddleware(requests, logger))` after `requestIdMiddleware()` and before `express.json()`; make `chatHandler` set `response.locals.chatOutcome` with the validated `conversationId`/`userId`/`reflect` and, on 200, `conversationId`, `route`, `metrics`, `trace`, and on each error the `errorCode` from the contract table; make `errorHandler` set `errorCode` (`INVALID_JSON`, `PROVIDER_ERROR`, `INTERNAL_ERROR`)
- [X] T020 [US2] Inject `new SqliteRequestStore()` as `requests` in `src/index.ts` and call `requests.close()` in the shutdown handler next to the other stores

**Checkpoint**: US1 + US2 — toda execução de `/chat` fica gravada com registro e trace completos.

---

## Phase 5: User Story 3 - Consulta de uma requisição por identificador (Priority: P2)

**Goal**: `GET /requests/:id` devolve o registro e o trace ordenado; 404 `REQUEST_NOT_FOUND`; 400 para id não UUID.

**Independent Test**: `POST /chat` → extrair `requestId` → `GET /requests/:id` 200 com métricas e `trace` igual ao da resposta; id UUID inexistente → 404; `abc` → 400.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] Add tests in `src/http/server.test.ts`: after a successful `POST /chat`, `GET /requests/:id` returns 200 with the shape in `specs/013-persisted-trace-logs/contracts/requests-http.md` (`metrics` populated, `trace` `deepEqual` to the chat `body.trace`); for a failed chat (e.g. 404 conversation) it returns `status`, `errorCode`, `metrics: null`, `trace: []`; unknown UUID → 404 `{ error: "Request not found: <id>", code: "REQUEST_NOT_FOUND" }`; non-UUID → 400 `{ issues }`; the GET response has its own `X-Request-Id` different from the queried id, and neither the 200 nor the 400/404 bodies carry that own id (200 `body.requestId` is the queried one); the GET itself is not recorded in the store

### Implementation for User Story 3

- [X] T022 [US3] Add `getRequestHandler(store)` to `src/http/request-trace.ts`: validate `request.params.id` with `z.uuid()` (400 `{ issues }`), call `getRequestOrThrow(store, id)` and translate `DomainError` with code `REQUEST_NOT_FOUND` into 404 `{ error: error.message, code: error.code }` (other errors go to `next(error)`); success → 200 `RequestDetail` JSON
- [X] T023 [US3] Register `app.get("/requests/:id", getRequestHandler(requests))` in `createApp` in `src/http/server.ts`, after `POST /chat` and before `errorHandler`

**Checkpoint**: Trace completo recuperável com uma única consulta.

---

## Phase 6: User Story 4 - Logs estruturados em JSON somente com metadados (Priority: P2)

**Goal**: Uma linha JSON por evento (`request.start`, `trace.event` × N, `request.end`), só com metadados em lista branca.

**Independent Test**: `POST /chat` com `createCapturingLogger` → toda linha `JSON.parse`-ável; sequência start → N × trace.event → end com o mesmo `requestId`; marcadores únicos de conteúdo ausentes de todas as linhas.

### Tests for User Story 4 ⚠️

- [X] T024 [P] [US4] Extend `src/obs/logger.test.ts` with tests for pure `traceEventMeta(event, seq)` per the whitelist in `specs/013-persisted-trace-logs/data-model.md`: `thought`/`observation`/`critique`/`answer`/`summarize` → `seq`, `node`, `type`, `chars`; `action` → `tool`, `argKeys` (count only, no values); `plan` → `steps` (count); `route` → `route` (no `reason`); `fallback` → `fromModel`, `toModel` (no `reason`); missing `node` is omitted
- [X] T025 [P] [US4] Add tests in `src/http/server.test.ts` with `createCapturingLogger`: for a 200 chat every line parses as JSON with `ts`, `level`, `event`, the same `requestId`; order is `request.start`, one `trace.event` per `body.trace` item with `seq` 0..N-1, then `request.end` with `status`, `latencyMs`, `route`, `llmCalls`, `modelUsed`, `traceEvents`; `request.end` level is `warn` for 4xx and `error` for 5xx and carries `errorCode`; `GET /requests/:id` emits only `request.start`/`request.end`; unique markers injected in the user message, answer, thought/observation content, action arg values, route reason and fallback reason never appear in any line

### Implementation for User Story 4

- [X] T026 [US4] Implement pure `traceEventMeta(event, seq)` in `src/obs/logger.ts` (whitelist only; `chars` = length of the textual content)
- [X] T027 [US4] Change `requestIdMiddleware()` to `requestIdMiddleware(logger)` in `src/http/request-trace.ts`: log `request.start` (`requestId`, `method`, `path` without query string) on entry and `request.end` on `finish` (`status`, `latencyMs` computed from `response.locals.startedAtMs` — same value as the persisted `latency_ms` —, level `info`/`warn` ≥ 400/`error` ≥ 500), adding pure `chatEndFields(response.locals.chatOutcome)` (`errorCode`, `route`, `llmCalls`, `modelUsed`, `traceEvents`) when present; update the call in `src/http/server.ts`
- [X] T028 [US4] In `chatAuditMiddleware` in `src/http/request-trace.ts`, emit `logger.info("trace.event", { requestId, ...traceEventMeta(event, seq) })` for each persisted trace event inside the prepended `finish` listener, so the lines precede `request.end`

**Checkpoint**: Todas as stories funcionais e testáveis de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validação final e documentação.

- [ ] T029 [P] Document `X-Request-Id`/`requestId`, `GET /requests/:id`, the `requests`/`trace_events` tables and the log event table in `README.md` — **pendente**: o repositório não tem `README.md`; o conteúdo já está em `contracts/` e `quickstart.md`
- [X] T030 Confirm no `console.*` remains in `src/http/server.ts` or `src/http/request-trace.ts`, and that no test opens the default `OPSPILOT_DB` or reads `.env`
- [X] T031 Run `npm run typecheck` and `npm run test` and fix any failures
- [ ] T032 Run the manual HTTP scenarios in `specs/013-persisted-trace-logs/quickstart.md` (curl `POST /chat`, `GET /requests/<id>`, 404, 400, persistence across restart) — **pendente (manual)**: usa OpenRouter e o `data/opspilot.db` real

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências
- **Foundational (Phase 2)**: depende do Setup — bloqueia todas as stories
- **US1 (Phase 3)**: depende da Foundational
- **US2 (Phase 4)**: depende da US1 (`requestId` em `response.locals` é a chave do registro)
- **US3 (Phase 5)**: depende da US2 (`RequestStore` e registros gravados)
- **US4 (Phase 6)**: depende da US1; `trace.event` (T028) depende de `chatAuditMiddleware` (T018) da US2. T024/T026 (`traceEventMeta`) podem começar logo após a Foundational
- **Polish (Phase 7)**: depende de todas as stories

### Within Each User Story

- Testes primeiro, falhando
- Tipos/stores antes de middlewares; middlewares antes do registro em `server.ts`
- `src/http/server.ts` e `src/http/server.test.ts` são compartilhados entre stories: tarefas nesses arquivos são sequenciais entre si

### Parallel Opportunities

- Foundational: T003 e T004 em paralelo após T002
- US1: T006 e T007 em paralelo
- US2: T012, T013, T014 (testes) em paralelo; T015 e T017 em paralelo (T017 depende só dos tipos de T015 — escreva T015 primeiro se trabalhar sozinho); T016 em paralelo com T018
- US3 e o par T024/T026 da US4 podem andar em paralelo com a US2 (arquivos diferentes)

---

## Parallel Example: User Story 2

```bash
# Testes da US2 juntos:
Task: "Contrato compartilhado Fake × SQLite em src/store/request-store.test.ts"
Task: "toRequestRecord em src/http/request-trace.test.ts"
Task: "Persistência via /chat em src/http/server.test.ts"

# Implementações independentes:
Task: "SqliteRequestStore em src/store/sqlite-request-store.ts"
Task: "FakeRequestStore em src/store/fake-request-store.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Phase 1 + Phase 2
2. Phase 3 (US1): `requestId` em todas as respostas
3. Phase 4 (US2): persistência — o valor central da feature
4. **STOP and VALIDATE**: `npm run test`; consultar a store em teste

### Incremental Delivery

1. Setup + Foundational → logger pronto
2. US1 → ids nas respostas
3. US2 → registros e trace persistidos (MVP)
4. US3 → consulta via HTTP
5. US4 → logs JSON completos sem conteúdo
6. Polish

---

## Notes

- [P] = arquivos diferentes, sem dependência incompleta
- Nenhuma dependência nova (`node:crypto`, `node:sqlite`, `node:perf_hooks`, Zod 4 `z.uuid()`)
- Contratos de erro existentes só ganham `requestId`; o único teste existente alterado é o `deepEqual` do 503
- Commit após cada tarefa ou grupo lógico
