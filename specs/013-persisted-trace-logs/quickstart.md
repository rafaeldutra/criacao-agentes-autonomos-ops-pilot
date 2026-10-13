# Quickstart: Trace Persistido e Logs Estruturados

## Pré-requisitos

- Feature 012 integrada (evento `fallback`, `metrics.modelUsed`, 503).
- `npm install` feito; `.env` configurado só para o cenário HTTP real.

## 1. Validação determinística (sem rede)

```bash
npm run typecheck
npm run test
```

| Cenário | Onde | Esperado |
|---------|------|----------|
| `requestId` em 200 e em erros (400 JSON, 400 Zod, 404, 422, 502, 503, 504, 500) | `src/http/server.test.ts` | header `X-Request-Id` = `body.requestId`, UUID; dois POSTs → ids distintos |
| Ida e volta da store | `src/store/request-store.test.ts` | Fake e SQLite `:memory:` passam o mesmo contrato; `get().trace` `deepEqual` ao gravado; ordem por `seq` |
| Atomicidade | `src/store/request-store.test.ts` | evento sem `type` (cast `as TraceEvent`) viola `NOT NULL` depois do `INSERT` em `requests` → `record` lança e `get` devolve `undefined`; gravar o mesmo `requestId` duas vezes também lança |
| Persistência pelo `/chat` | `src/http/server.test.ts` | registro com status/métricas/rota; `trace` igual a `body.trace`; erros com `errorCode` e trace vazio |
| Falha de persistência | `src/http/server.test.ts` | store que lança → resposta idêntica + log `request.persist_failed` |
| `GET /requests/:id` | `src/http/server.test.ts` | 200 com trace ordenado; 404 `REQUEST_NOT_FOUND` (via `DomainError`); 400 para id não UUID |
| Logger | `src/obs/logger.test.ts` | cada linha é `JSON.parse`-ável; `traceEventMeta` respeita a lista branca |
| Sem conteúdo nos logs | `src/http/server.test.ts` | marcadores únicos na mensagem, resposta, args e observações não aparecem em nenhuma linha |

Contratos: [chat-http](./contracts/chat-http.md),
[requests-http](./contracts/requests-http.md),
[logging](./contracts/logging.md). Modelo: [data-model](./data-model.md).

## 2. Validação HTTP manual (opcional, usa o OpenRouter)

```bash
npm run dev
```

```bash
curl -si -X POST localhost:3000/chat -H "content-type: application/json" \
  -d '{"message":"quais incidentes estão abertos?"}'
```

Esperado: header `X-Request-Id` e `requestId` iguais no corpo; no terminal,
linhas JSON `request.start`, N × `trace.event` e `request.end`, sem o texto
da pergunta ou da resposta.

```bash
curl -s localhost:3000/requests/<requestId>
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/requests/00000000-0000-4000-8000-000000000000   # 404
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/requests/abc                                  # 400
```

Esperado: o primeiro devolve o registro com o mesmo `trace` da resposta do chat.

Persistência entre reinícios: pare o servidor, suba de novo e repita o
`GET /requests/<requestId>`; o registro continua em `data/opspilot.db`.
