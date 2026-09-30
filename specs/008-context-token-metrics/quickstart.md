# Medição de contexto: Quickstart

## Prerequisites

- Features 005–007 no ar (`/chat` com conversa, memória, learningQueued).
- Node.js 22 LTS; dependências instaladas.
- Script opcional: `bash`, `curl`, `jq`; servidor em `BASE_URL` (default
  `http://localhost:3000`).

## Validação determinística

```powershell
npm run typecheck
npm test
```

A suíte deve cobrir:

1. `estimateTokens` — 10 chars → 2; vazio → 0; não múltiplo de 4
   ([tokens.md](./contracts/tokens.md)).
2. `promptTokensFromUsage` / `sumPromptTokensFromMessages` com
   `usage_metadata` fake e ausência de usage.
3. HTTP: stub com usage → `metrics.promptTokens === N`; sem usage → campo
   omitido; `contextBreakdown` sempre com `memory`/`history`/`message`
   ([chat-http.md](./contracts/chat-http.md)).
4. Breakdown com textos conhecidos coincide com chars/4 por fonte (SC-003).
5. Métricas legadas (historyMessages, memoryFacts, learningQueued) intactas.

## Smoke HTTP local (opcional)

```powershell
npm run dev
```

```powershell
curl -s -X POST http://127.0.0.1:3000/chat -H "content-type: application/json" -d "{\"message\":\"liste alertas firing\",\"userId\":\"demo-user\"}"
```

Esperado: `200` com `metrics.contextBreakdown` objeto numérico; com OpenRouter
real, `metrics.promptTokens` presente (inteiro ≥ 0).

## Script conversa longa (opcional)

Com o servidor no ar:

```bash
bash scripts/conversa-longa.sh
```

Esperado: cada turno imprime `promptTokens=<n>` ou `promptTokens=n/a` via
`jq -r '.metrics.promptTokens // "n/a"'`; mesmo `conversationId` ao longo dos
turnos. Estimativas locais req/res usam floor chars/4 (igual a `estimateTokens`).

## Security / scope checks

- Estimativa não substitui `promptTokens` real.
- Sem novas credenciais ou leitura de `.env`.
- Sem mudança de schema SQLite.
