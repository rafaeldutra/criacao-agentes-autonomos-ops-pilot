# Quickstart: Publicação da War Room no GitHub Pages

Contratos: [contracts/pages-workflow.md](./contracts/pages-workflow.md), [contracts/build-and-cors.md](./contracts/build-and-cors.md).

## 1. Local

```bash
npm run typecheck && npm run test                 # API (inclui Allow-Private-Network)
npm run web:typecheck && npm run web:test         # web (resolveBase, API URL padrão, 404.html)
VITE_BASE=/criacao-agentes-autonomos-ops-pilot/ npm run web:build
```

Esperado:
- `web/dist/index.html` e `web/dist/404.html` são idênticos.
- Os assets aparecem como `/criacao-agentes-autonomos-ops-pilot/assets/...`.
- Sem `VITE_BASE`, o build volta a `/opspilot/` (a feature 014 não muda).

Opcional: `npx actionlint .github/workflows/pages.yml` não aponta erros.

## 2. Configuração única no GitHub

1. Settings → Pages → **Source: GitHub Actions**.
2. (Opcional) Settings → Secrets and variables → Actions → Variables → `OPSPILOT_API_URL=https://<sua-api>`.
3. Na API: `OPSPILOT_CORS_ORIGINS=https://rafaeldutra.github.io[,outras]`.

## 3. Cenários

| # | Passo | Esperado | Req. |
|---|-------|----------|------|
| 1 | Push na `master` mudando um texto em `web/` | Fluxo "Pages" roda build → deploy; a execução mostra o `page_url`; a mudança aparece em `https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/` | US1-1/5, SC-001 |
| 2 | Abrir o endereço com e sem barra final e recarregar | 200, nenhum asset 404 (DevTools → Network) | US1-4, SC-004 |
| 3 | Abrir `.../criacao-agentes-autonomos-ops-pilot/qualquer-coisa` | A war room carrega (via 404.html) | FR-012 |
| 4 | Push na `master` mudando só `src/` | O fluxo não roda | US1-3 |
| 5 | PR com um teste da web quebrado | O job build falha no PR; o deploy não aparece | US2, SC-003 |
| 6 | PR corrigido | O build passa; o deploy é "skipped" | US2-2 |
| 7 | Actions → Pages → Run workflow (master) | Publica | US3-1 |
| 8 | Run workflow numa outra branch | O deploy é "skipped" | US3-4 |
| 9 | Dois pushes seguidos | Os deploys rodam um depois do outro; nenhum é cancelado | FR-005 |
| 10 | Revisar `pages.yml` | Só `contents: read` no topo; `pages`/`id-token: write` só no `deploy`; nenhum `secrets.` | FR-007/008, SC-005 |
| 11 | Página publicada + API local (`npm run dev` com a origem autorizada) | No Chrome, aceite o pedido de acesso à rede local se aparecer; "Testar conexão" → "API respondeu"; o chat funciona | FR-013 |
| 12 | Página publicada com a origem **não** autorizada | "Testar conexão" → "A API recusou esta origem (CORS)" | Edge case |

```bash
# Preflight de rede local (API local)
curl -i -X OPTIONS http://localhost:3000/chat \
  -H "Origin: https://rafaeldutra.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Private-Network: true"
# → 204 com Access-Control-Allow-Private-Network: true (com a origem autorizada)
```
