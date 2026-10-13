# Requests HTTP Contract

## `GET /requests/:id`

`:id` validado com `z.uuid()`. Sem autenticação (mesmo modelo do `/chat`).
A resposta tem header `X-Request-Id` próprio (o da consulta, não o consultado).
O id da consulta aparece **somente no header**: nenhum corpo desta rota
(200, 400, 404 ou 500 do `errorHandler`) recebe `withRequestId`, porque no 200
o campo `requestId` do corpo é o da requisição consultada.

### `200`

```json
{
  "requestId": "3f2b6c1e-9a4d-4c1b-8f7e-2d5a0b9c1e44",
  "createdAt": "2026-10-13T14:02:11.120Z",
  "conversationId": "conv-...",
  "userId": null,
  "route": "react",
  "reflect": false,
  "status": 200,
  "errorCode": null,
  "latencyMs": 834,
  "metrics": {
    "llmCalls": 2,
    "promptTokens": 1510,
    "modelUsed": "anthropic/claude-sonnet-5.5",
    "historyMessages": 4,
    "memoryFacts": 1,
    "contextBreakdown": { "memory": 12, "history": 340, "message": 7, "summary": 0 }
  },
  "trace": [
    { "type": "thought", "content": "context built", "node": "context" },
    { "type": "route", "route": "react", "reason": "...", "node": "router" },
    { "type": "answer", "content": "...", "node": "react" }
  ]
}
```

- `metrics` é `null` quando o status não é 200.
- `metrics.contextBreakdown` é **estimado** (chars/4) por fonte do contexto
  inicial; `promptTokens` é o uso **real** somado de todas as chamadas ao LLM.
  Pode ser `null` (rota sem breakdown ou registro anterior à coluna).
- `trace` vem em ordem crescente de `seq` e é igual ao `trace` entregue
  na resposta original do `/chat` (payload completo, inclusive conteúdo).

### `400`

`{ "issues": [ ...zod issues ] }` quando `:id` não é UUID.

### `404`

```json
{ "error": "Request not found: <id>", "code": "REQUEST_NOT_FOUND" }
```

Também é a resposta enquanto a requisição consultada ainda está em andamento.

### Persistência e logs

A consulta não é gravada em `requests`; gera apenas `request.start` e
`request.end` no log.
