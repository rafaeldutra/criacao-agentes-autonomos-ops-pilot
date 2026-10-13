# Research: Trace Persistido e Logs Estruturados

Base: código em `012-model-fallback-resilience` (implementação concluída,
`npm run typecheck` e `npm run test` verdes, 153 testes).

## R1 — Geração e propagação do `requestId`

**Decision**: Middleware global `requestIdMiddleware`, registrado antes de
`express.json()`, gera `crypto.randomUUID()`, guarda em
`response.locals.requestId` e define o header `X-Request-Id` imediatamente.
O corpo recebe `requestId` explicitamente: o `chatHandler` e o `errorHandler`
montam o JSON com um helper puro `withRequestId(requestId, body)`.

**Rationale**: o header precisa existir até para o 400 de JSON inválido, que
nasce em `express.json()` antes do handler; por isso o middleware vem
primeiro. Incluir o campo de forma explícita mantém os contratos de corpo
visíveis no código. `node:crypto` já faz parte do runtime, sem dependência
nova.

**Alternatives considered**: sobrescrever `response.json` (comportamento
implícito, difícil de testar e de ler); aceitar o `X-Request-Id` do cliente
(risco de colisão na chave primária; está fora do escopo na spec).

## R2 — Momento e gatilho da persistência

**Decision**: Middleware `chatAuditMiddleware`, montado em `/chat` antes de
`express.json()`, lê o início já registrado pelo `requestIdMiddleware`
(`response.locals.startedAt`/`startedAtMs`, uma única medição para registro e
log) e registra o listener com `response.prependOnceListener("finish")`, para
rodar antes do listener de `request.end` do `requestIdMiddleware` e manter as
linhas `trace.event` antes de `request.end` no log. Ao terminar, monta o `RequestRecordInput` a partir
de `response.statusCode` e de `response.locals.chatOutcome`, que o handler e o
`errorHandler` preenchem com conversa, usuário, rota, métricas, trace e
`errorCode`. Grava e loga dentro de um `try/catch`.

**Rationale**: um único ponto cobre todos os desfechos: 200, os erros
tratados no handler (404/422/502/503/504), o 400 do Zod e os 400/502/500 do
`errorHandler`. Como roda depois do envio, uma falha de gravação não tem como
alterar a resposta (FR-007).

**Alternatives considered**: gravar dentro do `chatHandler` (não cobre o 400
de JSON nem o `errorHandler`); gravar antes de responder (acrescenta latência
e acopla falha de banco à resposta).

**Notes**: requisição abortada pelo cliente (sem `finish`) não é persistida.
No 504, a promessa de `runChat` continua pendente e não há trace parcial
acessível, então o trace persistido fica vazio.

## R3 — Armazenamento SQLite

**Decision**: Nova interface `RequestStore` (`record`, `get`, `close`) em
`src/store/request-store.ts`, com `SqliteRequestStore` (`node:sqlite`, mesmo
`OPSPILOT_DB`, conexão própria como as demais stores) e `FakeRequestStore`.
Um `record` grava `requests` e todos os `trace_events` dentro de
`BEGIN`/`COMMIT`, com `ROLLBACK` em erro. O payload é o JSON do evento sem
`type` e `node`, que viram colunas próprias. Leitura com
`ORDER BY seq ASC`.

**Rationale**: segue o padrão de `SqliteConversationStore` (schema
idempotente, prepared statements, `:memory:` em teste, fake para
`createApp` padrão). Colunas `node`/`type` permitem filtros futuros sem
analisar JSON.

**Alternatives considered**: reaproveitar a conexão de outra store (cria
acoplamento entre stores); `INSERT` sem transação (viola FR-006); guardar o
trace como um único JSON em `requests` (perde a ordenação e a consulta por
evento pedidas na spec).

## R4 — Logger estruturado

**Decision**: `src/obs/logger.ts` exporta `createLogger({ out?, err?, now? })`
→ `{ info, warn, error }(event, fields)`, a função pura
`formatLogLine(entry): string` (`JSON.stringify` em uma linha) e a função pura
`traceEventMeta(event, seq)`. Os `fields` aceitam apenas valores primitivos
(`string | number | boolean | null | undefined`), o que impede pelo tipo
despejar objetos de domínio. `traceEventMeta` só extrai `seq`, `node`,
`type`, `tool` (action), `route` (route), `fromModel`/`toModel` (fallback),
`steps` (plan) e `chars` (comprimento do conteúdo textual). Padrão: `info`
vai para `process.stdout`, `warn`/`error` para `process.stderr`.

**Rationale**: a lista branca de metadados em uma função pura dá um ponto
único e testável para FR-012. O `reason` de rota e de fallback fica de fora,
porque é texto de LLM ou do provedor. Não há dependência nova (pino/winston
não estão na stack obrigatória).

**Alternatives considered**: pino (dependência nova, redaction baseada em
caminhos é frágil para payloads variáveis); lista negra de campos (falha
aberta quando surgir um tipo novo de evento).

## R5 — Validação de `GET /requests/:id`

**Decision**: `z.uuid()` (Zod 4) sobre `request.params.id`; inválido → 400
`{ issues }` (mesmo formato do `/chat`); inexistente → 404
`{ error, code: "REQUEST_NOT_FOUND" }`.

**Rationale**: o servidor só gera UUIDs (R1), então qualquer outro formato é
erro do cliente e não precisa chegar ao banco.

## R6 — Latência registrada

**Decision**: `requests.latency_ms` é a duração HTTP total (do middleware até
`finish`), disponível em todo status. As métricas do grafo (`llmCalls`,
`promptTokens`, `modelUsed`, `historyMessages`, `memoryFacts`) só existem
em 200 e ficam `NULL` nos erros.

**Rationale**: a spec pede latência em todos os registros, inclusive
504/503; o `metrics.latencyMs` do grafo não existe nesses casos.

## R7 — Composição e migração de logs

**Decision**: `ChatServerOptions` ganha `requests?: RequestStore` (padrão
`FakeRequestStore`) e `logger?: Logger` (padrão `createLogger()`).
`src/index.ts` injeta `SqliteRequestStore` e fecha a store no shutdown. Os
`console.error` de `server.ts` (`[http]`, `[history-summarizer]`) migram para
o logger (`http.error`, `history_summary.failed`), registrando `errorName` e
a primeira linha da mensagem (≤ 200 caracteres), sem stack.
`learning-reflector`, `arena`, `bench` e MCP ficam como estão.

**Rationale**: os testes existentes continuam usando os defaults em memória
sem mudança; produção ganha persistência só pela composição (princípio X).
