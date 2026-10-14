# OpsPilot — War Room (web)

Interface web do OpsPilot para quem está de plantão: conversa com o agente, raciocínio de cada resposta, aprovação de ações sensíveis e configuração da API. Projeto npm separado (Vite + React + TypeScript strict + Zod). O caminho base é `/opspilot/` por padrão (hospedagem própria) e configurável por `VITE_BASE`.

**Publicada em:** https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/ (ver [Publicação no GitHub Pages](#publicação-no-github-pages)).

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

### Caminho base (build)

`VITE_BASE` define o prefixo de todos os assets e o redirecionamento sem barra final. Padrão: `/opspilot/`. Valores com `..`, `//`, `:` ou espaços fazem o build falhar.

```sh
VITE_BASE=/criacao-agentes-autonomos-ops-pilot/ npm run web:build
```

> No Git Bash do Windows, caminhos que começam com `/` são convertidos para caminhos do Windows e o build recusa o valor. Use `MSYS_NO_PATHCONV=1 VITE_BASE=/... npm run web:build` ou, no PowerShell, `$env:VITE_BASE="/..."; npm run web:build`.

Todo build também gera `dist/404.html`, uma cópia do `index.html`, para que hospedagens estáticas sirvam a war room em caminhos desconhecidos.

### URL da API (build)

A URL padrão da API é fixada no build pela variável `VITE_OPSPILOT_API_URL`. Se ela estiver vazia ou inválida, vale o padrão `http://localhost:3000`:

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

## Hospedagem própria sob `/opspilot/`

Todos os assets são gerados com o prefixo `/opspilot/` (`base` em `vite.config.ts`). A aplicação tem uma única rota, mas o servidor estático deve devolver `index.html` para qualquer caminho sob `/opspilot/`, para que acesso direto e recarregamento funcionem. Exemplo para nginx:

```nginx
location = /opspilot { return 301 /opspilot/; }
location /opspilot/ { alias /srv/opspilot/dist/; try_files $uri $uri/ /opspilot/index.html; }
```

Copie o conteúdo de `web/dist/` para o diretório servido (no exemplo, `/srv/opspilot/dist/`).

## Publicação no GitHub Pages

O fluxo [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) publica a war room em **https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/**.

| Gatilho | O que acontece |
|---------|----------------|
| Push na `master` alterando `web/**`, o próprio fluxo ou os fixtures de contrato | typecheck → testes → build → publicação |
| Pull request com essas mudanças | typecheck → testes → build, **sem publicar** |
| Actions → **Pages** → **Run workflow** | igual ao push (publica só a partir da `master`) |

Se qualquer etapa falhar, nada é publicado e a versão anterior continua no ar. As publicações são serializadas e uma publicação em andamento nunca é cancelada.

**Permissões**: o fluxo inteiro só lê o repositório (`contents: read`); apenas o job `deploy` recebe `pages: write` e `id-token: write`, no ambiente protegido `github-pages`. Nenhum segredo é usado.

### Configuração única (administração do repositório)

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. *(Opcional)* **Settings → Secrets and variables → Actions → Variables → New repository variable**: `OPSPILOT_API_URL` = URL da API que a página publicada deve usar por padrão.
   - É uma **variável**, não um segredo: o valor vai para o JavaScript entregue ao navegador.
   - Use `https://`. Uma página `https` não pode chamar uma API `http://` remota (conteúdo misto). A exceção é `http://localhost`.
   - Sem a variável, a página usa `http://localhost:3000`. Cada pessoa pode trocar a URL na engrenagem.
3. Na API, autorize a origem do Pages (só esquema + host, sem o caminho do repositório):

   ```sh
   OPSPILOT_CORS_ORIGINS=https://rafaeldutra.github.io npm run dev
   ```

### Página publicada + API local

Quando a página publicada chama uma API em `localhost`, o Chrome trata isso como acesso à rede local. Ele pode pedir permissão ("acessar dispositivos na rede local"); aceite. Antes disso, envia um preflight com `Access-Control-Request-Private-Network: true`, que a API responde com `Access-Control-Allow-Private-Network: true` somente para origens autorizadas. Se **Testar conexão** mostrar "A API recusou esta origem (CORS)", confira `OPSPILOT_CORS_ORIGINS`.

### Verificar ou repetir uma publicação

- **Actions → Pages**: cada execução mostra os jobs `build` e `deploy`; o `deploy` exibe o endereço publicado (`page_url`).
- Para republicar sem commit (por exemplo, depois de mudar `OPSPILOT_API_URL`): **Run workflow** na `master`.
- Para reproduzir o build do Pages localmente:

  ```sh
  VITE_BASE=/criacao-agentes-autonomos-ops-pilot/ npm run web:build
  npm --prefix web run preview   # http://localhost:4173/criacao-agentes-autonomos-ops-pilot/
  ```

## Estrutura

- `src/api/`: esquemas Zod do contrato HTTP, cliente (`createApiClient`) e mapeamento de erros (`toUiError`).
- `src/state/`: estado puro da conversa, dos cartões de aprovação e das configurações.
- `src/components/`: componentes com CSS Modules; apenas tokens de `src/styles/tokens.css`.
- Regras de design obrigatórias: [`.github/instructions/design.instructions.md`](../.github/instructions/design.instructions.md).
