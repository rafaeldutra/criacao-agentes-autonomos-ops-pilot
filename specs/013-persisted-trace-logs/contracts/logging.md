# Logging Contract (`src/obs/logger.ts`)

## Formato

Uma linha por evento: `JSON.stringify(entry) + "\n"`, sem quebras internas.
`info` vai para stdout; `warn` e `error` vão para stderr. Os destinos e o
relógio são injetáveis.

```json
{"ts":"2026-10-13T14:02:11.120Z","level":"info","event":"trace.event","requestId":"3f2b...","seq":3,"node":"react","type":"action","tool":"list_incidents","argKeys":1}
```

## API

```ts
type LogLevel = "info" | "warn" | "error";
type LogFields = Record<string, string | number | boolean | null | undefined>;
type Logger = Record<LogLevel, (event: string, fields?: LogFields) => void>;

createLogger(options?: { out?: (line: string) => void; err?: (line: string) => void; now?: () => Date }): Logger;
formatLogLine(entry: { ts: string; level: LogLevel; event: string } & LogFields): string; // pura
traceEventMeta(event: TraceEvent, seq: number): LogFields;                                // pura, lista branca
errorMeta(error: unknown): LogFields;                                                    // pura: errorName, errorMessage (1ª linha, ≤200)
```

## Eventos

| `event` | Nível | Quando | Campos |
|---------|-------|--------|--------|
| `request.start` | info | entrada de qualquer rota | `requestId`, `method`, `path` |
| `trace.event` | info | cada evento do trace de `/chat` (após `finish`) | `requestId` + `traceEventMeta` |
| `request.end` | info (warn ≥ 400, error ≥ 500) | `finish` de qualquer rota | `requestId`, `method`, `path`, `status`, `latencyMs`; em `/chat` também `errorCode`, `route`, `llmCalls`, `promptTokens` (quando disponível), `modelUsed`, `traceEvents` |
| `request.persist_failed` | error | `RequestStore.record` lançou | `requestId` + `errorMeta` |
| `http.error` | error | erro inesperado no `errorHandler` (500) | `requestId` + `errorMeta` |
| `history_summary.failed` | error | `onError` do resumo de histórico | `requestId`, `conversationId` + `errorMeta` |

`path` é a rota sem query string.

## Proibido em qualquer linha

O texto da mensagem do usuário, `answer`, o conteúdo de
`thought`/`observation`/`critique`/`summarize`, `plan.steps[].description`,
os valores de `action.args`, o `reason` de `route`/`fallback`, fatos de
memória e stack traces. Os testes verificam isso com marcadores únicos
injetados na mensagem, na resposta e nos payloads.
