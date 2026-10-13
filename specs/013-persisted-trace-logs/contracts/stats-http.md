# Stats HTTP Contract

## `GET /stats?since=<janela>`

Agrega as requisições `/chat` persistidas em `requests` com
`created_at >= agora - janela`. Sem autenticação (mesmo modelo do `/chat`).
A consulta não é gravada em `requests`.

`since`: `<n>m`, `<n>h` ou `<n>d`, de 1 minuto até `90d`. Padrão `24h`.

### `200`

```json
{
  "since": "24h",
  "from": "2026-10-12T16:00:00.000Z",
  "to": "2026-10-13T16:00:00.000Z",
  "total": 42,
  "errors": 3,
  "promptTokens": 158340,
  "costUsd": 0.0123,
  "unpricedRequests": 0,
  "latencyMs": { "p50": 8120, "p95": 61000 },
  "byRoute": {
    "react": { "total": 30, "errors": 0, "promptTokens": 90000, "costUsd": 0.01, "unpricedRequests": 0, "latencyMs": { "p50": 6000, "p95": 20000 } },
    "unknown": { "total": 3, "errors": 3, "promptTokens": 0, "costUsd": 0, "unpricedRequests": 0, "latencyMs": { "p50": 180000, "p95": 180000 } }
  },
  "byModel": {
    "openai/gpt-4o-mini": { "...": "mesmo formato" },
    "unknown": { "...": "mesmo formato" }
  }
}
```

- `errors`: requisições com status `>= 400`.
- `latencyMs`: percentil nearest-rank sobre todas as requisições da janela
  (inclusive erros); `null` quando a janela está vazia.
- `costUsd`: só tokens de **prompt** (`promptTokens × preço / 1M`); tokens de
  saída não são persistidos. Preços vêm de `OPSPILOT_MODEL_PRICES`
  (JSON `{ "<modelo>": <USD por 1M prompt tokens> }`). Modelos `*:free` e
  `openrouter/free` custam 0. Modelos sem preço não entram no custo e são
  contados em `unpricedRequests`.
- Erros não guardam rota nem modelo, então caem na chave `unknown` de
  `byRoute` e `byModel`.

### `400`

```json
{ "error": "Invalid since: 1w (expected <n>m, <n>h or <n>d, up to 90d)", "code": "INVALID_WINDOW" }
```
