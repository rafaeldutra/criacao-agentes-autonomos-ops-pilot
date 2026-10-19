# Contract: `.github/workflows/pages.yml`

> **Substituído em 2026-10-19** por `.github/workflows/deploy.yml`, a pedido da pessoa mantenedora. Ele dispara só em push na `master` e por disparo manual, sem PR nem filtro de caminhos; os jobs `build` (`npm ci`, `npm test`, `npm run build` em `web/` com `VITE_BASE=/<repo>/`, depois `upload-pages-artifact`) e `deploy` (`deploy-pages`, ambiente `github-pages`) continuam; as permissões `contents: read`, `pages: write` e `id-token: write` ficam no nível do fluxo. O conteúdo abaixo é o registro histórico da 015.

## Gatilhos

| Evento | Filtro | Jobs |
|--------|--------|------|
| `push` | branches: `master`; paths: `web/**`, `.github/workflows/pages.yml`, `specs/014-war-room-web/contracts/fixtures/**` | build → deploy |
| `pull_request` | mesmos `paths` | build (sem deploy) |
| `workflow_dispatch` | — | build → deploy (deploy só se `github.ref == refs/heads/master`) |

## Permissões

```yaml
permissions:
  contents: read          # topo: padrão de todos os jobs

jobs:
  deploy:
    permissions:
      contents: read
      pages: write          # publicar
      id-token: write       # OIDC exigido por deploy-pages
```

Nenhum `secrets.*` no arquivo.

## Concorrência

- Fluxo: `group: pages-${{ github.ref }}`, `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`.
- Job `deploy`: `group: pages-deploy`, `cancel-in-progress: false`.

## Job `build` (ubuntu-latest, timeout 15 min)

1. `actions/checkout`
2. `actions/setup-node` com `node-version: 22`, `cache: npm` e `cache-dependency-path: web/package-lock.json`
3. `npm ci --prefix web`
4. `npm --prefix web run typecheck`
5. `npm --prefix web run test`
6. `npm --prefix web run build` com env:
   - `VITE_BASE: /${{ github.event.repository.name }}/`
   - `VITE_OPSPILOT_API_URL: ${{ vars.OPSPILOT_API_URL }}`
7. `actions/upload-pages-artifact` com `path: web/dist`

## Job `deploy` (ubuntu-latest, timeout 10 min)

- `needs: build`
- `if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'`
- `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`
- passo único `actions/deploy-pages` (`id: deployment`)

## Configuração única no repositório (fora do arquivo)

- Settings → Pages → Build and deployment → **Source: GitHub Actions**.
- (Opcional) Settings → Secrets and variables → Actions → **Variables** → `OPSPILOT_API_URL` = URL `https` da API.
- O ambiente `github-pages`, criado pelo GitHub, restringe deploys à branch padrão.
