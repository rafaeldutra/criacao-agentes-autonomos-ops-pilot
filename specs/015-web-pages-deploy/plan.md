# Implementation Plan: Publicação da War Room no GitHub Pages

**Branch**: `015-web-pages-deploy` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-web-pages-deploy/spec.md`

## Summary

Publicar a war room (`web/`) no GitHub Pages com um fluxo do GitHub Actions em dois jobs:
- **build**: typecheck, testes, build e `upload-pages-artifact`. Roda em push na `master`, em PR e em disparo manual.
- **deploy**: `deploy-pages`. Só em push ou disparo manual na `master`, com `pages: write` e `id-token: write` apenas nesse job, serializado e no ambiente `github-pages`.

O build ganha um base configurável (`VITE_BASE`, padrão `/opspilot/`). No Pages ele é `/<nome-do-repo>/`, ou seja, `https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/`. O build também passa a gerar um `404.html` (cópia do `index.html`) e a tratar uma URL da API vazia como ausente.

A API passa a aceitar o preflight de acesso à rede local para origens autorizadas, para que a página publicada consiga falar com uma API em `localhost`.

README novo na raiz e `web/README.md` atualizado.

## Technical Context

**Language/Version**: TypeScript strict (web e API); YAML do GitHub Actions; Node 22 LTS no CI.

**Primary Dependencies**: `actions/checkout`, `actions/setup-node`, `actions/upload-pages-artifact`, `actions/deploy-pages`. Nenhuma dependência npm nova.

**Storage**: N/A.

**Testing**: Vitest em `web/` (`resolveBase`, `resolveDefaultApiUrl`, emissão do `404.html`); `node:test` na API (cabeçalho de rede local); `actionlint` opcional; validação final pela primeira execução real (quickstart).

**Target Platform**: GitHub Actions (`ubuntu-latest`) e GitHub Pages (site de projeto).

**Project Type**: CI/CD + configuração de build do frontend existente.

**Performance Goals**: do push à página no ar em ≤ 10 min (SC-001); o fluxo atual leva em torno de 2–3 min.

**Constraints**: permissões mínimas por job; nenhum segredo; comportamento da 014 inalterado sem `VITE_BASE`; `npm run typecheck`/`test` e `web:*` verdes.

**Scale/Scope**: 1 workflow, 2 READMEs, cerca de 4 arquivos de código alterados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Avaliação | Status |
|---|-----------|-----------|--------|
| I | Camadas explícitas | A mudança na API fica na borda HTTP (`cors.ts`); na web, só config e estado de settings | ✅ |
| II | Validação na fronteira | `VITE_BASE` e `VITE_OPSPILOT_API_URL` validados por funções puras; o cabeçalho de rede local é avaliado na borda | ✅ |
| III | Erros de domínio | Base inválido falha o build com mensagem clara; nenhum erro novo de domínio | ✅ |
| IV | Funções puras | `resolveBase`, `resolveDefaultApiUrl` e `corsHeadersFor` (estendida) | ✅ |
| V | Teste é parte da tarefa | Testes para as três funções e para a emissão do `404.html`; o fluxo é validado pelo quickstart | ✅ |
| VI | Segurança por padrão | `contents: read` padrão; escrita só no deploy; sem segredos; deploy só da `master` no ambiente protegido; nenhum `.env` | ✅ |
| VII | Spec antes de código | Spec 015 clarificada e este plano | ✅ |
| VIII | Pequeno e reversível | Sem `VITE_BASE`, tudo como na 014; remover o fluxo desfaz a publicação | ✅ |
| IX/X | Persistência / reprodutibilidade | N/A; `npm ci` com lockfile garante builds reprodutíveis | ✅ |
| — | Stack web (1.2.0) | Usa a stack aprovada; Node 22 no CI conforme a stack obrigatória | ✅ |

**Pós-design**: reavaliado após os contratos. Sem violações.

## Project Structure

### Documentation (this feature)

```text
specs/015-web-pages-deploy/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── pages-workflow.md
│   └── build-and-cors.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
.github/workflows/pages.yml           # NOVO: build + deploy
README.md                             # NOVO: visão geral do repositório
src/http/cors.ts                      # Allow-Private-Network (preflight de origem permitida)
src/http/cors.test.ts
web/
├── vite.config.ts                    # base de VITE_BASE; redirect com base resolvido; plugin 404.html
├── build-config.ts                   # NOVO: resolveBase (puro), usado pelo vite.config
├── src/build-config.test.ts          # NOVO
├── src/build.test.ts                 # base padrão continua /opspilot/; 404.html emitido
├── src/state/settings.ts             # resolveDefaultApiUrl (vazio/inválido → padrão)
├── src/state/settings.test.ts
└── README.md                         # seção "Publicação no GitHub Pages"
```

**Structure Decision**: o fluxo fica em `.github/workflows/`, ao lado das instruções existentes em `.github/`. A lógica testável (base, URL padrão, CORS) fica em funções puras próximas de onde é usada; o YAML só orquestra.

## Complexity Tracking

Nenhuma violação.
