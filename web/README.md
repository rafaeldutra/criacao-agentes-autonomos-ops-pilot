# OpsPilot — War Room (web)

Interface web do OpsPilot para quem está de plantão: conversa com o agente, raciocínio de cada resposta, aprovação de ações sensíveis e configuração da API. Projeto npm separado (Vite + React + TypeScript strict + Zod), publicado sob o caminho base `/opspilot/`.

## Comandos

Na raiz do repositório:

| Comando | O que faz |
|---------|-----------|
| `npm run web:dev` | servidor de desenvolvimento em `http://localhost:5173/opspilot/` |
| `npm run web:test` | testes (Vitest + Testing Library + axe-core) |
| `npm run web:typecheck` | checagem de tipos |
| `npm run web:build` | build de produção em `web/dist/` |

Para testar o build localmente: `npm --prefix web run preview` e abrir `http://localhost:4173/opspilot/`.

## Configuração

### URL da API (build)

A URL padrão da API é fixada no build pela variável `VITE_OPSPILOT_API_URL` (padrão `http://localhost:3000`):

```sh
VITE_OPSPILOT_API_URL=https://api.exemplo.com npm run web:build
```

Cada pessoa pode trocar a URL na engrenagem (**Configurações**) sem recompilar. A escolha fica no `localStorage` do navegador (`opspilot.apiUrl`, `opspilot.theme`).

### CORS (API)

A API só aceita chamadas de navegador das origens listadas em `OPSPILOT_CORS_ORIGINS` (separadas por vírgula, sem `*`):

```sh
OPSPILOT_CORS_ORIGINS=https://ops.exemplo.com npm run dev
```

Sem a variável, a API aceita apenas as origens de desenvolvimento (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`). Se o botão **Testar conexão** responder "A API recusou esta origem (CORS)", inclua o endereço da war room nessa lista.

## Publicação sob `/opspilot/`

Todos os assets são gerados com o prefixo `/opspilot/` (`base` em `vite.config.ts`). A aplicação tem uma única rota, mas o servidor estático deve devolver `index.html` para qualquer caminho sob `/opspilot/`, para que acesso direto e recarregamento funcionem. Exemplo para nginx:

```nginx
location = /opspilot { return 301 /opspilot/; }
location /opspilot/ { alias /srv/opspilot/dist/; try_files $uri $uri/ /opspilot/index.html; }
```

Copie o conteúdo de `web/dist/` para o diretório servido (no exemplo, `/srv/opspilot/dist/`).

## Estrutura

- `src/api/`: esquemas Zod do contrato HTTP, cliente (`createApiClient`) e mapeamento de erros (`toUiError`).
- `src/state/`: estado puro da conversa, dos cartões de aprovação e das configurações.
- `src/components/`: componentes com CSS Modules; apenas tokens de `src/styles/tokens.css`.
- Regras de design obrigatórias: [`.github/instructions/design.instructions.md`](../.github/instructions/design.instructions.md).
