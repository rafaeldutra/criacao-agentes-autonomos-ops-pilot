# Quickstart: Resiliência e Fallback de Modelos

Validação alinhada a [contracts/model-resilience.md](./contracts/model-resilience.md)
e [contracts/chat-http.md](./contracts/chat-http.md). Entidades em
[data-model.md](./data-model.md).

## Prerequisites

- Node.js 22, `npm install`
- Para validação com rede: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
  `OPENROUTER_MODEL_FALLBACK` no `.env` (ver `.env.example`; não usar nos
  testes automatizados)

## 1. Testes determinísticos (CI)

```bash
npm run test
npm run typecheck
```

Esperado após a implementação:

| Arquivo                               | Cenários                                                      |
|---------------------------------------|---------------------------------------------------------------|
| `src/agents/model.test.ts`            | sucesso primário sem `fallback`; erro 503 1× → retry ok; 401 → reserva sem retry; esgotado → reserva + `recordFallback`; ambos falham → `ModelUnavailableError`; `bindTools`/`withStructuredOutput` aplicados aos dois; variável ausente → erro |
| `src/agents/model-usage.test.ts`      | no-op fora de escopo; escopos concorrentes isolados; `drainFallbacks` esvazia |
| `src/agents/trace.test.ts`            | `fallback()` e `formatTrace` com `[fallback@node]`            |
| `src/agents/production-graph.test.ts` | evento `fallback` com `node` da estratégia; `metrics.modelUsed`; roteador relança `ModelUnavailableError`; turno seguinte volta ao primário |
| `src/http/server.test.ts`             | 503 + `{ error, code: "MODEL_SERVICE_UNAVAILABLE" }` sem stack; 504 ainda vence; 200 traz `modelUsed` |

## 2. HTTP local (opcional, com rede)

```bash
npm run dev
```

**Caminho primário**:

```http
POST /chat
Content-Type: application/json

{"message":"Liste alertas firing","strategy":"react"}
```

Esperado: `200`, `metrics.modelUsed = OPENROUTER_MODEL`, sem evento `fallback`.

**Forçar fallback**: reiniciar com `OPENROUTER_MODEL` apontando para um id
inexistente (ex.: `invalid/model`) e repetir. Esperado: `200`, evento
`fallback` no `trace` com `fromModel`/`toModel`/`reason`, e
`metrics.modelUsed = OPENROUTER_MODEL_FALLBACK`.

**Falha total**: os dois ids inválidos. Esperado: `503`
`{"error":"Language model service unavailable","code":"MODEL_SERVICE_UNAVAILABLE"}`.

**Configuração ausente**: remover `OPENROUTER_MODEL_FALLBACK` e rodar
`npm run dev`. Esperado: falha na inicialização com
`OPENROUTER_MODEL_FALLBACK is required`.
