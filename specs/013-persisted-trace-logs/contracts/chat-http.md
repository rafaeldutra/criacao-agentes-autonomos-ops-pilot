# Chat HTTP Contract (extensão requestId)

Estende `specs/012-model-fallback-resilience/contracts/chat-http.md`.
O request não muda; um `X-Request-Id` enviado pelo cliente é ignorado.

## Header (toda resposta, qualquer rota)

```
X-Request-Id: 3f2b6c1e-9a4d-4c1b-8f7e-2d5a0b9c1e44
```

## Corpo

Todo corpo JSON de `POST /chat` ganha `requestId` com o mesmo valor do header.

### `200`

```json
{
  "requestId": "3f2b6c1e-9a4d-4c1b-8f7e-2d5a0b9c1e44",
  "conversationId": "conv-...",
  "answer": "...",
  "route": "react",
  "trace": [ ... ],
  "metrics": { "llmCalls": 2, "latencyMs": 812, "modelUsed": "..." }
}
```

### Erros

| Status | Quando | Corpo | `error_code` persistido |
|--------|--------|-------|-------------------------|
| 400 | JSON inválido (`errorHandler`) | `{ requestId, error }` | `INVALID_JSON` |
| 400 | Zod | `{ requestId, issues }` | `VALIDATION_ERROR` |
| 404 | conversa inexistente | `{ requestId, error, code }` | `CONVERSATION_NOT_FOUND` |
| 422 | strategy desconhecida | `{ requestId, error }` | `UNKNOWN_STRATEGY` |
| 502 | `ROUTER_FAILED` | `{ requestId, error, code }` | `ROUTER_FAILED` |
| 502 | `PROVIDER_ERROR` (`errorHandler`) | `{ requestId, error, code }` | `PROVIDER_ERROR` |
| 503 | `MODEL_SERVICE_UNAVAILABLE` | `{ requestId, error, code }` | `MODEL_SERVICE_UNAVAILABLE` |
| 504 | timeout | `{ requestId, error }` | `CHAT_TIMEOUT` |
| 500 | erro inesperado (`errorHandler`) | `{ requestId, error }` | `INTERNAL_ERROR` |

Os campos existentes (`error`, `code`, `issues`) não mudam. Os códigos sem
`code` no corpo hoje existem apenas na persistência e nos logs, não na resposta.

## Persistência

Depois de `finish`, um registro em `requests` e N linhas em `trace_events`
(N = `body.trace.length` em 200; 0 em erro). Uma falha de gravação não
altera a resposta já enviada e gera um log `request.persist_failed`.
