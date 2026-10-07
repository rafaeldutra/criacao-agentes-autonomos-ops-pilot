# Quickstart: Grafo unificado de produção

Validação local alinhada a [contracts/production-graph.md](./contracts/production-graph.md)
e [contracts/chat-http.md](./contracts/chat-http.md). Sem implementar nesta fase.

## Prerequisites

- Node.js 22, dependências do repo (`npm install`)
- Para `/chat` com roteador LLM real: `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`
  (não usar nos testes automatizados)

## 1. Testes determinísticos (CI)

```bash
npm run test
npm run typecheck
```

Esperado após a implementação:

- `src/agents/production-graph.test.ts`: override vs `decideRoute` injetado;
  `ROUTER_FAILED`; um único `run`; `node` em todos os eventos; prompt =
  `buildContext`
- `src/agents/trace.test.ts`: `route` + `withNode`; formato antigo sem `node`
- `src/http/server.test.ts`: default de teste com `decideRoute` → `react`;
  casos novos de override, 422, 502; asserts 010 de budget ainda verdes

## 2. HTTP local (opcional, com rede)

```bash
npm run dev
```

Override:

```http
POST /chat
Content-Type: application/json

{"message":"Liste alertas firing","strategy":"react"}
```

Esperado: `200`; no `trace`, evento `type=route`, `route=react`,
`reason=client override`, `node=router`; demais eventos com `node`.

Automático (omite `strategy`):

```http
POST /chat
Content-Type: application/json

{"message":"Abra um incidente e depois resolva em passos"}
```

Esperado: evento `route` com `reason` não vazio e `route` ∈
`react` | `plan-and-execute` | `reflect`.

Desconhecido:

```http
POST /chat
Content-Type: application/json

{"message":"x","strategy":"unknown"}
```

Esperado: `422` `{ "error": "Unknown strategy: unknown" }`.

## 3. Fora de escopo

`npm run arena` / `npm run bench` / MCP continuam no registry direto, sem este
grafo.
