# Research: Publicação da War Room no GitHub Pages

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-14

## R1. Forma do fluxo (um arquivo, dois jobs)

**Decisão**: `.github/workflows/pages.yml` com dois jobs:
- `build`: checkout → setup-node (Node 22, cache npm por `web/package-lock.json`) → `npm ci --prefix web` → `typecheck` → `test` → `build` → `actions/upload-pages-artifact` (`path: web/dist`). Roda em push, PR e disparo manual.
- `deploy`: `needs: build`, `if` (push ou `workflow_dispatch`) **e** `github.ref == refs/heads/<branch padrão>`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`, um único passo `actions/deploy-pages` (id `deployment`).

Ações nas majors estáveis atuais, verificadas na implementação: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5` (majors confirmados em 2026-10-14).

**Racional**:
- O par `upload-pages-artifact` + `deploy-pages` é o mecanismo oficial (FR-004).
- Separar os jobs permite dar escrita **só** ao `deploy` (FR-007).
- O artefato do PR é gerado, mas nunca implantado (FR-002, SC-003).
- A condição de branch no `if` mais a regra de branch do ambiente `github-pages` dão dupla proteção (US3-4).

**Alternativas**: um job só (as permissões de escrita vazariam para build e testes); `peaceiris/actions-gh-pages` com branch `gh-pages` (exige `contents: write` e um token de push; não é o mecanismo pedido).

## R2. Caminho base no Pages

**Decisão**: o `vite.config.ts` passa a ler o base de `VITE_BASE`, normalizado por uma função pura `resolveBase(raw)`: vazio ou ausente vira `/opspilot/`; garante a barra inicial e a final; rejeita `..`, `//` e esquemas. O fluxo define `VITE_BASE: /${{ github.event.repository.name }}/`, que resulta em `/criacao-agentes-autonomos-ops-pilot/` (derivado do repositório, FR-010).

O plugin de redirect sem barra final (feature 014) passa a usar o base resolvido. No Pages, `/<repo>` → `/<repo>/` já é redirecionado pelo próprio serviço.

**Alternativas**: `actions/configure-pages` → `outputs.base_path`. Exige o Pages já habilitado e chama a API do Pages, o que falha em PRs de forks ou antes da configuração inicial. Ganharia só o suporte a domínio próprio, que está fora do escopo. Base relativo (`./`): quebra o redirect do plugin e URLs absolutas e não é recomendado com rotas.

## R3. Página de "não encontrado"

**Decisão**: um plugin do Vite (`closeBundle`) copia `dist/index.html` para `dist/404.html` em todo build. Como os assets usam caminho absoluto com o base, o Pages serve a war room em qualquer caminho inexistente sob o site (FR-012). A mesma cópia é inofensiva na hospedagem própria.

**Alternativas**: um passo `cp` no fluxo (a lógica ficaria só no CI e não seria testável localmente); um 404 com `<meta refresh>` para o base (exige um segundo arquivo e muda a URL).

## R4. Endereço da API no build

**Decisão**: `VITE_OPSPILOT_API_URL: ${{ vars.OPSPILOT_API_URL }}`, uma variável do repositório e **não** um segredo (FR-008). Uma variável inexistente vira **string vazia** no Actions. Por isso `DEFAULT_API_URL` passa de `??` para um `trim() || "http://localhost:3000"` (função pura `resolveDefaultApiUrl(raw)`), e o valor também é validado por `parseApiUrl`: se for inválido, cai no padrão (FR-011).

## R5. Gatilhos, filtros e concorrência

**Decisão**:
- `push` na branch `master` e `pull_request`, com `paths`: `web/**`, `.github/workflows/pages.yml` e `specs/014-war-room-web/contracts/fixtures/**` (os testes da web importam esses fixtures).
- `workflow_dispatch` sem inputs.
- `concurrency: { group: pages-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }` no nível do fluxo, para cancelar builds de PR obsoletos.
- No job `deploy`, `concurrency: { group: pages-deploy, cancel-in-progress: false }`, que serializa as publicações sem cancelar a que está em andamento (FR-005).

## R6. Permissões

**Decisão**: `permissions: { contents: read }` no topo. O job `deploy` sobrescreve com `pages: write`, `id-token: write` (OIDC exigido por `deploy-pages`) e `contents: read`. Nenhum `secrets.*` é usado (FR-007/FR-008, SC-005).

## R7. Acesso à rede local (FR-013)

**Decisão**: estender a função pura `corsHeadersFor` com o parâmetro `requestPrivateNetwork: boolean`. Num preflight de origem **permitida** com `Access-Control-Request-Private-Network: true`, a resposta inclui `Access-Control-Allow-Private-Network: true`. Origens não permitidas continuam com 403 e sem esse cabeçalho.

**Racional**: o Chrome envia esse preflight quando uma página pública (`https://*.github.io`) chama `localhost`. Sem a resposta, o padrão "API local" da página publicada falharia. Versões mais novas do Chrome também pedem permissão de "acesso à rede local" ao usuário; isso é comportamento do navegador e fica documentado no README.

## R8. Validação do fluxo

**Decisão**:
- Testes unitários (Vitest) para `resolveBase`, `resolveDefaultApiUrl` e a emissão de `404.html` (build em diretório temporário com `VITE_BASE`).
- Testes `node:test` para o cabeçalho de rede local.
- O YAML é validado localmente com `actionlint` via `npx` quando disponível e, de forma definitiva, pela primeira execução no GitHub (quickstart).
- Não se adiciona dependência de parser YAML ao projeto só para isso.

## R9. README

**Decisão**:
- Criar `README.md` na raiz (visão geral, stack, comandos da API e da web, variáveis de ambiente, link para a war room publicada e para `web/README.md`, fluxo Spec Kit).
- Atualizar `web/README.md` com a seção "Publicação no GitHub Pages": endereço, gatilhos, configuração única ("Settings → Pages → Source: GitHub Actions"), variável `OPSPILOT_API_URL`, origem `https://rafaeldutra.github.io` em `OPSPILOT_CORS_ORIGINS`, exigência de `https` para API pública, acesso à rede local e como reexecutar.
