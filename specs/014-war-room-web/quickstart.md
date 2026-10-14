# Quickstart: War Room Web

Guia de validação ponta a ponta. Contratos: [contracts/](./contracts/). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node.js 22 LTS e dependências da raiz instaladas (`npm install`).
- `OPENROUTER_API_KEY` configurada no ambiente (nunca versionada).
- Dependências da web: `npm --prefix web install`.

## 1. Verificações automáticas

```bash
npm run typecheck && npm run test          # API (inclui gate, approvals, CORS e contrato dos fixtures)
npm run web:typecheck && npm run web:test  # web (componentes, schemas, redutores, axe)
npm run web:build                          # gera web/dist com base /opspilot/
```

Esperado: tudo verde. `web/dist/index.html` referencia os assets como `/opspilot/assets/...`.

## 2. Subir API e war room (dev)

```bash
npm run seed            # cenário Mercadinho (idempotente)
npm run dev             # API em http://localhost:3000
npm run web:dev         # war room em http://localhost:5173/opspilot/
```

Sem `OPSPILOT_CORS_ORIGINS`, a origem `http://localhost:5173` já está liberada.

## 3. Cenários manuais

| # | Passo | Esperado | Requisitos |
|---|-------|----------|-----------|
| 1 | Abrir `/opspilot/` | Estado vazio com 3 exemplos | US1-7 |
| 2 | Clicar "Quais alertas estão disparando?" | Mensagem aparece, "processando", depois resposta | US1-1/2 |
| 3 | "Ver raciocínio" | Painel com Rota, Ação `list_alerts`, Observação e Resposta, e métricas no topo; `Esc` devolve o foco | US2 |
| 4 | "Resolva o incidente aberto do checkout" | Cartão "Resolver incidente …" com motivo; campo de mensagem bloqueado | US3-1, FR-015 |
| 5 | Tentar `POST /chat` na mesma conversa via `curl` | 409 `APPROVAL_PENDING` | R5 |
| 6 | "Negar" | Cartão "Negado" com horário; o agente diz que não agiu; o incidente continua aberto (`list_incidents`) | US3-3 |
| 7 | Repetir 4 e "Aprovar" | Cartão "Aprovado"; resposta final; o incidente fica resolvido **uma vez** | US3-2, SC-003 |
| 8 | Reenviar a mesma decisão via `curl -X POST .../approvals/<id>/decision` | 409 `APPROVAL_ALREADY_DECIDED`, sem nova execução | FR-016c |
| 9 | "Abra um incidente para payments, severidade high" | Executa direto, sem cartão | US3-8 |
| 10 | ⚙ → URL `ftp://x` | Erro junto ao campo; não salva | US4-3 |
| 11 | ⚙ → URL `http://localhost:3999` → Testar | "Não foi possível alcançar a API" | US4-4 |
| 12 | Parar a API e enviar uma mensagem | Erro "Não foi possível falar com a API" com atalho para ⚙ | US1-6 |
| 13 | Alternar o tema e recarregar | Tema mantido, sem flash do tema errado | US4-7 |
| 14 | Navegar todo o fluxo 2–7 só com teclado | Tudo operável, com foco visível | FR-025 |

## 4. CORS

```bash
# origem permitida: 204 com Allow-Origin
curl -i -X OPTIONS http://localhost:3000/chat -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: POST"
# origem não permitida: 403 sem Allow-Origin
curl -i -X OPTIONS http://localhost:3000/chat -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST"
# sem Origin: comportamento inalterado
curl -i http://localhost:3000/stats
# '*' é recusado na inicialização
OPSPILOT_CORS_ORIGINS='*' npm run dev   # deve falhar com mensagem clara
```

## 5. Publicação sob /opspilot/

```bash
npm run web:build
npm --prefix web run preview   # http://localhost:4173/opspilot/
```

Recarregar `http://localhost:4173/opspilot/` (com e sem barra final) carrega sem 404 de assets. Num servidor estático real, configure o fallback de `/opspilot/*` para `/opspilot/index.html`. Exemplo para nginx:

```nginx
location = /opspilot { return 301 /opspilot/; }
location /opspilot/ { alias /srv/opspilot/dist/; try_files $uri $uri/ /opspilot/index.html; }
```

O caminho base é configurável por `VITE_BASE` (feature 015; padrão `/opspilot/`). A publicação no GitHub Pages está em `specs/015-web-pages-deploy/quickstart.md`.

Para outro ambiente: `VITE_OPSPILOT_API_URL=https://api.exemplo.com npm run web:build`, e na API `OPSPILOT_CORS_ORIGINS=https://ops.exemplo.com`.
