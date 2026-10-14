---
description: "Tarefas de publicação da War Room no GitHub Pages via Actions"
---

# Tasks: Publicação da War Room no GitHub Pages

**Input**: Design documents from `/specs/015-web-pages-deploy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos para a lógica nova (princípio V): `resolveBase`, `resolveDefaultApiUrl`, a emissão de `404.html` e `Allow-Private-Network`. O YAML do fluxo é validado com `actionlint` (quando disponível) e pela primeira execução real (quickstart).

**Organization**: tarefas por user story. Web: `web/build-config.ts`, `web/vite.config.ts`, `web/src/state/settings.ts`. API: `src/http/cors.ts`. Fluxo: `.github/workflows/pages.yml`. Docs: `README.md` (novo) e `web/README.md`. Base da feature: 014 já implementada na branch `014-war-room-web`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]–[US4] mapeiam as stories da spec

---

## Phase 1: Setup

- [X] T001 Verify baseline on the current branch: `npm run typecheck`, `npm run test`, `npm run web:typecheck`, `npm run web:test` and `npm run web:build` green; confirm `web/dist/index.html` references `/opspilot/assets/` (feature 014 behavior to preserve when `VITE_BASE` is unset)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: base configurável e `404.html` no build. O fluxo da US1 depende disso para publicar sob `/<repo>/`.

**⚠️ CRITICAL**: a US1 não publica corretamente antes desta fase.

- [X] T002 [P] Create tests `web/src/build-config.test.ts` (Vitest, `// @vitest-environment node`) for pure `resolveBase(raw: string | undefined): string` covering every row of the table in `specs/015-web-pages-deploy/data-model.md#buildconfig-web-em-tempo-de-build`: `undefined`/`""`/`"  "` → `/opspilot/`; `/criacao-agentes-autonomos-ops-pilot/` unchanged; `criacao-agentes-autonomos-ops-pilot` → `/criacao-agentes-autonomos-ops-pilot/`; `/a/b` → `/a/b/`; throws an `Error` mentioning `VITE_BASE` for `../x`, `//evil`, `https://x/`, `/a b/`
- [X] T003 Create `web/build-config.ts` exporting `DEFAULT_BASE = "/opspilot/"` and pure `resolveBase(raw)` per T002 (trim; empty → default; reject `..` segments, `//`, `:` and whitespace with `Error("VITE_BASE inválido: ...")`; ensure leading and trailing `/`); add `"build-config.ts"` to `include` in `web/tsconfig.json`
- [X] T004 Update `web/vite.config.ts`: compute `const base = resolveBase(process.env.VITE_BASE)` and use it for `base` and in the bare-base redirect plugin (replace the `BASE` constant); add plugin `emitNotFoundPage()` whose `closeBundle` copies `<outDir>/index.html` to `<outDir>/404.html` (use `node:fs` `copyFileSync`, resolve `outDir` from the resolved config in `configResolved`; skip when `index.html` is absent, e.g. in Vitest)
- [X] T005 Update `web/src/build.test.ts`: keep "publishes under /opspilot/" (no `VITE_BASE` in the test env); add a test that runs Vite's `build()` programmatically with `{ configFile: <web/vite.config.ts>, logLevel: "silent", build: { outDir: <tmp dir>, emptyOutDir: true } }` and `process.env.VITE_BASE = "/criacao-agentes-autonomos-ops-pilot/"` (restored in `finally`), then asserts `404.html` exists, is byte-identical to `index.html`, and `index.html` references `/criacao-agentes-autonomos-ops-pilot/assets/`; clean the tmp dir; mark the test with a 60 s timeout

**Checkpoint**: `VITE_BASE=/x/ npm run web:build` gera assets em `/x/assets/` e `404.html`; sem a variável, nada muda em relação à 014.

---

## Phase 3: User Story 1 - Publicação automática a cada mudança aprovada (Priority: P1) 🎯 MVP

**Goal**: push na `master` que toca `web/` → verificação, build e publicação no Pages, com o `page_url` na execução.

**Independent Test**: push de uma mudança visível em `web/` na `master` → o fluxo "Pages" fica verde e `https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/` mostra a mudança sem assets 404.

### Tests for User Story 1 ⚠️

- [X] T006 [P] [US1] Add tests in `web/src/state/settings.test.ts` for pure `resolveDefaultApiUrl(raw: string | undefined): string`: `undefined`, `""`, `"   "` → `http://localhost:3000`; `"https://api.exemplo.com/"` → `https://api.exemplo.com`; invalid (`"ftp://x"`, `"not a url"`) → `http://localhost:3000`

### Implementation for User Story 1

- [X] T007 [US1] In `web/src/state/settings.ts`, add exported pure `resolveDefaultApiUrl(raw)` (trim; empty → `http://localhost:3000`; otherwise `parseApiUrl(raw)` and fall back to the default when invalid) and define `DEFAULT_API_URL = resolveDefaultApiUrl(import.meta.env.VITE_OPSPILOT_API_URL)`, moving the declaration below `parseApiUrl` if needed; existing settings tests stay green
- [X] T008 [US1] Create `.github/workflows/pages.yml` per `specs/015-web-pages-deploy/contracts/pages-workflow.md`: `name: Pages`; triggers `push` (branches `[master]`, paths `web/**`, `.github/workflows/pages.yml`, `specs/014-war-room-web/contracts/fixtures/**`), `pull_request` (same paths) and `workflow_dispatch`; top-level `permissions: { contents: read }`; top-level `concurrency: { group: pages-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`; job `build` (`runs-on: ubuntu-latest`, `timeout-minutes: 15`) with steps `actions/checkout@v5`, `actions/setup-node@v5` (`node-version: 22`, `cache: npm`, `cache-dependency-path: web/package-lock.json`), `npm ci --prefix web`, `npm --prefix web run typecheck`, `npm --prefix web run test`, `npm --prefix web run build` with `env: { VITE_BASE: "/${{ github.event.repository.name }}/", VITE_OPSPILOT_API_URL: "${{ vars.OPSPILOT_API_URL }}" }`, then `actions/upload-pages-artifact@v4` with `path: web/dist`; job `deploy` with `needs: build`, `if: github.event_name != 'pull_request' && github.ref == 'refs/heads/master'`, `runs-on: ubuntu-latest`, `timeout-minutes: 10`, job-level `permissions: { contents: read, pages: write, id-token: write }`, `concurrency: { group: pages-deploy, cancel-in-progress: false }`, `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }` and a single step `id: deployment` using `actions/deploy-pages@v4`; before writing, confirm the current major versions of the four actions (fall back to the ones listed if offline) and use no `secrets.*`
- [X] T009 [US1] Validate `.github/workflows/pages.yml`: run `npx --yes actionlint .github/workflows/pages.yml` if it can be installed (otherwise `npx --yes yaml-lint` or a `node -e` parse with no new project dependency); fix any reported issue; record the validation result in this task's note

**Checkpoint**: o fluxo está pronto para a primeira execução na `master` (quickstart, cenários 1–4).

---

## Phase 4: User Story 2 - Verificação em pull requests sem publicar (Priority: P2)

**Goal**: PRs que tocam `web/` rodam a verificação e nunca publicam.

**Independent Test**: um PR com um teste da web quebrado → job `build` vermelho e `deploy` "skipped"; corrigido → `build` verde e `deploy` "skipped".

- [X] T010 [US2] Review `.github/workflows/pages.yml` against `specs/015-web-pages-deploy/spec.md` US2: `pull_request` uses the same `paths` as `push`; the `deploy` job `if` excludes `pull_request`; the PR concurrency group cancels stale PR builds only; adjust the file if anything diverges

---

## Phase 5: User Story 3 - Publicação manual e permissões mínimas (Priority: P2)

**Goal**: disparo manual; escrita só no deploy; deploys serializados; fora da `master`, nada é publicado. A página publicada consegue falar com uma API local autorizada.

**Independent Test**: "Run workflow" na `master` publica; noutra branch, o deploy é pulado; inspeção do YAML confirma as permissões; preflight com `Access-Control-Request-Private-Network: true` de origem autorizada → `Allow-Private-Network: true`.

### Tests for User Story 3 ⚠️

- [X] T011 [P] [US3] Add tests in `src/http/cors.test.ts`: `corsHeadersFor(ALLOWED, "OPTIONS", allowlist, true)` adds `"Access-Control-Allow-Private-Network": "true"` to the 204 headers; `corsHeadersFor(ALLOWED, "OPTIONS", allowlist, false)` and `corsHeadersFor(ALLOWED, "POST", allowlist, true)` do not; `corsHeadersFor("https://evil.example", "OPTIONS", allowlist, true)` stays 403 with only `Vary`; an HTTP test via `createApp` with `corsOrigins: ["https://rafaeldutra.github.io"]` sends `OPTIONS /chat` with `Origin: https://rafaeldutra.github.io`, `Access-Control-Request-Method: POST`, `Access-Control-Request-Private-Network: true` and asserts 204 + `access-control-allow-private-network: true`

### Implementation for User Story 3

- [X] T012 [US3] In `src/http/cors.ts`, add the optional parameter `requestPrivateNetwork = false` to `corsHeadersFor` and include `"Access-Control-Allow-Private-Network": "true"` only for allowed-origin preflights when it is true; in `corsMiddleware`, pass `request.headers["access-control-request-private-network"] === "true"`; existing CORS tests stay green
- [X] T013 [US3] Review `.github/workflows/pages.yml` against `specs/015-web-pages-deploy/contracts/pages-workflow.md` (Permissões, Concorrência): top level only `contents: read`; `pages: write`/`id-token: write` only on `deploy`; deploy concurrency `cancel-in-progress: false`; `workflow_dispatch` present; `grep -n "secrets\." .github/workflows/pages.yml` returns nothing

---

## Phase 6: User Story 4 - Documentação atualizada (Priority: P3)

**Goal**: README da raiz (novo) e `web/README.md` explicam a publicação, a configuração única e a integração com a API.

**Independent Test**: seguindo só os READMEs, alguém habilita o Pages, configura `OPSPILOT_API_URL` e `OPSPILOT_CORS_ORIGINS` e abre a war room publicada.

- [X] T014 [P] [US4] Update `web/README.md`: in the intro, say the base is `/opspilot/` by default and configurable via `VITE_BASE`; add `VITE_BASE` to "Configuração"; add the section "Publicação no GitHub Pages" with: public URL `https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/`; triggers (push on `master` touching `web/**`, PR without deploy, manual "Run workflow"); one-time setup "Settings → Pages → Build and deployment → Source: GitHub Actions"; optional repository variable `OPSPILOT_API_URL` (Settings → Secrets and variables → Actions → Variables; public value, never a secret; must be `https` unless `localhost`); API side `OPSPILOT_CORS_ORIGINS` must include `https://rafaeldutra.github.io` (origin has no path); Chrome's local-network access prompt when the page calls a local API; how to check a deploy (Actions → Pages → `page_url`) and re-run it; build locally with `VITE_BASE=/criacao-agentes-autonomos-ops-pilot/ npm run web:build`
- [X] T015 [P] [US4] Create root `README.md` (pt-BR): one-paragraph overview of OpsPilot (on-call copilot for alerts and incidents; LangChain/LangGraph agent over OpenRouter; human approval for `resolve_incident`/`forget_preference`); stack summary (API and `web/`); main commands table (`dev`, `test`, `typecheck`, `seed`, `mcp`, `arena`, `bench`, `web:dev`, `web:test`, `web:typecheck`, `web:build`); environment variables pointer to `.env.example` (never commit `.env`); "War Room" section with the published URL, link to `web/README.md` and a "Pages" workflow status badge `https://github.com/rafaeldutra/criacao-agentes-autonomos-ops-pilot/actions/workflows/pages.yml/badge.svg`; "Fluxo de desenvolvimento" with the Spec Kit sequence and links to `.specify/memory/constitution.md` and `specs/`

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T016 Run `npm run typecheck`, `npm run test`, `npm run web:typecheck`, `npm run web:test`, `npm run web:build` (expects `/opspilot/` + `404.html`) and `VITE_BASE=/criacao-agentes-autonomos-ops-pilot/ npm run web:build` (expects the repo base); all green
- [X] T017 Update `.github/copilot-instructions.md` (and `specs/014-war-room-web/quickstart.md` section 5 if it mentions a fixed base) to mention the Pages workflow, `VITE_BASE` and `OPSPILOT_API_URL`
- [X] T018 Execute the local part of `specs/015-web-pages-deploy/quickstart.md` (section 1 and the private-network `curl` against `npm run dev` with `OPSPILOT_CORS_ORIGINS=https://rafaeldutra.github.io`); record which GitHub-side scenarios (section 3) remain for a person with repository access

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** → **US1 (T006–T009)**.
- **US2 (T010)** and **US3-workflow (T013)** depend on T008 (same file; review in sequence: T008 → T009 → T010 → T013).
- **US3-API (T011–T012)** depends only on T001; it can run in parallel with Foundational/US1.
- **US4 (T014–T015)** depends on the final names (T004, T008); the two READMEs can be written in parallel.
- **Polish (T016–T018)** depends on everything.

```text
T001 ─▶ T002/T003 ─▶ T004 ─▶ T005 ─▶ T006/T007 ─▶ T008 ─▶ T009 ─▶ T010 ─▶ T013
  └──▶ T011 ─▶ T012                                   └──▶ T014 ‖ T015
                                                        all ─▶ T016 ─▶ T017 ─▶ T018
```

### Parallel Opportunities

- T002 (test) together with T006 (settings test) and T011 (CORS test).
- T011/T012 (API) in parallel with T002–T009 (web/workflow).
- T014 and T015 (READMEs).

## Parallel Example: User Story 3

```text
Task: "T011 Allow-Private-Network tests in src/http/cors.test.ts"
# while another person does T008 (workflow)
Task: "T012 corsHeadersFor requestPrivateNetwork in src/http/cors.ts"
```

## Implementation Strategy

### MVP First

1. T001 → Foundational (configurable base + 404) → US1 (workflow + API URL default).
2. Merge into `master`, enable Pages ("Source: GitHub Actions") and validate quickstart scenarios 1–4.

### Incremental Delivery

1. MVP (US1): automatic publishing.
2. US2: confirm PRs do not publish.
3. US3: manual dispatch, permission review, local-network preflight.
4. US4: READMEs.

## Notes

- Nunca usar `secrets.*` nem ler `.env`; `OPSPILOT_API_URL` é variável pública do repositório.
- Sem `VITE_BASE`, o comportamento da 014 (`/opspilot/`) não pode mudar.
- O deploy real só pode ser validado no GitHub, depois do merge na `master` e da configuração do Pages.

## Implementation notes (2026-10-14)

- **T008**: as majors atuais das ações (via `git ls-remote --tags`) são `checkout@v7`, `setup-node@v7`, `upload-pages-artifact@v5` e `deploy-pages@v5`, mais novas que as do contrato; o fluxo usa essas.
- **T009**: `actionlint` não está publicado no npm. O fluxo foi validado com `npx -p @action-validator/cli action-validator .github/workflows/pages.yml` (schema oficial do GitHub Actions): exit 0, só avisos de que globs em `paths` não são validados. Contraprova: o mesmo validador rejeita (exit 1) uma cópia com `runs-onn`.
- **T016**: API 262/262 e web 135/135 verdes. O build padrão referencia `/opspilot/assets/`; com `VITE_BASE=/criacao-agentes-autonomos-ops-pilot/`, referencia `/criacao-agentes-autonomos-ops-pilot/assets/`; `404.html` é idêntico ao `index.html` nos dois casos; `VITE_BASE=../x` falha o build. No Git Bash do Windows é preciso `MSYS_NO_PATHCONV=1` (documentado no `web/README.md`); no runner Linux não.
- **T018**: com a API real (`OPSPILOT_CORS_ORIGINS=https://rafaeldutra.github.io npm run dev`), o preflight com `Access-Control-Request-Private-Network: true` dessa origem → 204 + `Access-Control-Allow-Private-Network: true`; de `https://evil.example` → 403. **Pendentes (exigem acesso ao GitHub, após merge na `master` e "Source: GitHub Actions")**: cenários 1–12 da seção 3 do quickstart.
