# Implementation Plan: Trace Persistido e Logs Estruturados

**Branch**: `013-persisted-trace-logs` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-persisted-trace-logs/spec.md`

## Summary

Um middleware global gera um UUID por requisição e o devolve em
`X-Request-Id`; as respostas de `/chat` (sucesso e todos os erros) também o
trazem no corpo. Um middleware de auditoria em `/chat` registra, no `finish`,
um `requests` e os `trace_events` (ordem, `node`, `type`, payload completo)
em uma transação SQLite via a nova `RequestStore`, isolando falhas da
resposta. `src/obs/logger.ts` escreve uma linha JSON por evento
(`request.start`, `trace.event`, `request.end`, falhas) com metadados em lista
branca. `GET /requests/:id` devolve o registro e o trace ordenado.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4 (`z.uuid()`), `node:sqlite`
(`DatabaseSync`), `node:crypto` (`randomUUID`), `node:perf_hooks`; nenhuma
dependência nova

**Storage**: SQLite `OPSPILOT_DB` (default `./data/opspilot.db`); novas
tabelas `requests` e `trace_events` ([data-model](./data-model.md)); testes em
`:memory:`

**Testing**: `node:test` via `tsx`; `FakeRequestStore`, logger com destino
capturado, strategies stub já usadas em `server.test.ts`; sem rede

**Target Platform**: Node.js 22 LTS (HTTP local)

**Project Type**: Serviço HTTP de raciocínio operacional

**Performance Goals**: gravação síncrona após `finish` (fora do caminho da
resposta); leitura por chave primária

**Constraints**: logs só com metadados (FR-012); falha de persistência
invisível ao cliente; contratos de erro existentes preservados (só
acréscimo de `requestId`); testes não leem `.env` nem abrem o banco padrão

**Scale/Scope**: 3 módulos novos (`obs/logger.ts`, `store/request-store.ts`,
`store/sqlite-request-store.ts` + fake), 1 módulo HTTP novo
(`http/request-trace.ts`), ajustes em `server.ts` e `index.ts`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS. Model = `RequestStore` (SQLite/fake);
  serviço = funções puras `toRequestRecord`, `traceEventMeta` e
  `formatLogLine`; controller = middlewares e handler em
  `http/request-trace.ts` e `server.ts`.
- **Validação na fronteira**: PASS. `:id` validado com `z.uuid()`; o body do
  `/chat` continua com Zod.
- **Erros de domínio**: PASS. `REQUEST_NOT_FOUND` → 404 na borda; os códigos
  existentes são preservados.
- **Funções puras**: PASS. Montagem do registro, metadados de log e
  serialização são puros; IO fica na store e nos destinos do logger.
- **Teste obrigatório**: PASS. FR-015 coberto por `request-store.test.ts`,
  `logger.test.ts` e extensões de `server.test.ts`.
- **Segurança**: PASS. Nenhum segredo; logs sem conteúdo; o payload completo
  fica só no banco local (gitignored). `GET /requests/:id` sem autenticação é
  uma decisão registrada na spec.
- **Spec antes de código**: PASS. Spec `013-persisted-trace-logs`, que
  depende da 012 concluída.
- **Pequeno e reversível**: PASS. Mudanças aditivas; o único teste existente
  afetado é o `deepEqual` do 503 em `server.test.ts`, que passa a incluir
  `requestId`.
- **Persistência local explícita**: PASS. `node:sqlite`, DDL idempotente,
  prepared statements, `OPSPILOT_DB`, `:memory:` em teste.
- **Reprodutibilidade**: PASS. O fake implementa o mesmo contrato do SQLite
  (teste de paridade); `createApp` usa o fake por padrão e `index.ts` injeta
  o SQLite.

*Post-design re-check*: PASS. O ponto único de gravação (`finish`) cobre todos
os status sem acoplar banco e resposta. A lista branca de log é pura e
testável. Nenhum novo `console.*` na borda HTTP.

## Project Structure

### Documentation (this feature)

```text
specs/013-persisted-trace-logs/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-http.md
│   ├── requests-http.md
│   └── logging.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks; não criado aqui
```

### Source Code (repository root)

```text
src/obs/
├── logger.ts                     # NOVO: createLogger, formatLogLine, traceEventMeta, errorMeta
├── test-logger.ts                # NOVO: createCapturingLogger (destino capturado para testes)
└── logger.test.ts                # NOVO
src/store/
├── request-store.ts              # NOVO: RequestStore, RequestRecordInput, RequestDetail, REQUEST_NOT_FOUND, getRequestOrThrow
├── sqlite-request-store.ts       # NOVO: DDL requests/trace_events, record transacional, get ordenado
├── fake-request-store.ts         # NOVO
└── request-store.test.ts         # NOVO: contrato compartilhado fake × :memory:
src/http/
├── request-trace.ts              # NOVO: requestIdMiddleware, chatAuditMiddleware, toRequestRecord, withRequestId, chatEndFields, getRequestHandler
├── request-trace.test.ts         # NOVO: funções puras da borda
├── server.ts                     # ordem dos middlewares; requestId nos corpos; chatOutcome; logger no lugar de console.error; rota GET /requests/:id
└── server.test.ts                # novos cenários + ajuste do deepEqual 503
src/index.ts                      # injeta SqliteRequestStore; fecha no shutdown
```

Ordem na `createApp`: `requestIdMiddleware` (gera o id, aplica o header e
loga `request.start`/`request.end`) → `app.use("/chat", chatAuditMiddleware)`
→ `express.json()` → `POST /chat` → `GET /requests/:id` → `errorHandler`.

**Structure Decision**: A persistência segue o padrão das stores existentes
(interface + SQLite + fake, conexão própria em `OPSPILOT_DB`). A captura
acontece na borda HTTP, no `finish`, a partir do que o handler já calcula
(`response.locals.chatOutcome`), sem tocar no grafo nem nas strategies. O
logger fica em `src/obs/`, como pedido, e é injetado via `ChatServerOptions`
para testes. `runChat` recebe o `requestId` só para rotular o log de falha do
resumo de histórico.

## Complexity Tracking

> Sem violações de constituição a justificar.
