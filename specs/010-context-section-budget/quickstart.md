# ContextBuilder / orçamento por seção: Quickstart

## Prerequisites

- Features 005–009 no ar (`/chat` com conversa, memória, resumo, métricas).
- Node.js 22 LTS; dependências instaladas.

## Validação determinística

```powershell
npm run typecheck
npm test
```

A suíte deve cobrir:

1. `buildContext` com defaults — seções abaixo do teto passam intactas
   ([context-builder.md](./contracts/context-builder.md)).
2. Tetos baixos na **janela** — mensagens mais antigas saem primeiro; a mais
   recente permanece (SC-001).
3. Tetos baixos em **memórias** — menor score sai primeiro (SC-002).
4. Budgets 0 nas orçáveis — system + mensagem atual intactos (SC-003).
5. `loadSectionBudgets` — defaults e fallback de env inválido.
6. HTTP: `contextBreakdown` e contagens (`historyMessages` / `memoryFacts`)
   refletem o pós-corte ([chat-http.md](./contracts/chat-http.md)).

## Smoke HTTP local (opcional)

```powershell
npm run dev
```

```powershell
curl -s -X POST http://127.0.0.1:3000/chat -H "content-type: application/json" -d "{\"message\":\"liste alertas firing\",\"userId\":\"demo-user\"}"
```

Esperado: `200` com `metrics.contextBreakdown` numérico; prompt da strategy
montado via builder (sem regressão funcional abaixo dos tetos default).

## Knobs de orçamento

Em `.env` / ambiente (documentados em `.env.example`):

```text
CONTEXT_BUDGET_SUMMARY=200
CONTEXT_BUDGET_WINDOW=1200
CONTEXT_BUDGET_MEMORIES=300
```

Para observar corte agressivo em smoke, baixe os valores (ex.: `WINDOW=50`,
`MEMORIES=20`) e compare `historyMessages` / `memoryFacts` / breakdown entre
turnos.

## Security / scope checks

- Builder puro nos testes (budgets injetados); sem leitura de `.env` nos testes.
- Sem schema SQLite novo.
- Sem novas credenciais.
- Arena/bench/MCP fora do escopo mínimo.
