---
description: "Tarefas de implementação da War Room web, aprovação humana e CORS do OpsPilot"
---

# Tasks: War Room Web

**Input**: Design documents from `/specs/014-war-room-web/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos. O princípio V da constituição exige teste para toda lógica nova; SC-003/SC-007/SC-008 exigem verificação automatizada (execução única, CORS, axe).

**Organization**: tarefas agrupadas por user story.
- **API**: aprovação em `src/approvals/` + `src/store/*approval-store.ts` + `src/http/approvals.ts`; CORS em `src/http/cors.ts`; composição em `src/http/server.ts` e `src/index.ts`. Testes da API em `node:test` com `FakeApprovalStore`/`SqliteApprovalStore(":memory:")` e `createCapturingLogger()`. Nunca usar o `OPSPILOT_DB` padrão, `.env` ou o modelo real.
- **Web**: projeto separado em `web/`, testado com Vitest + Testing Library + `vitest-axe`. As respostas da API são simuladas com os fixtures de `specs/014-war-room-web/contracts/fixtures/`.
- Toda UI segue `.github/instructions/design.instructions.md`: tokens, os 4 estados, dark mode, WCAG 2.2 AA.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: [US1]–[US5] mapeiam as stories da spec
- Sempre incluir o caminho do arquivo na descrição

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: governança e esqueleto dos projetos, sem mudar o comportamento da API.

- [X] T001 Amend `.specify/memory/constitution.md` to version 1.2.0 (MINOR, `Last Amended: 2026-10-14`): add section "Stack da interface web (`web/`)" listing Vite, React, TypeScript strict, Zod for API responses, CSS Modules + design tokens, Vitest + Testing Library + vitest-axe, and mandatory compliance with `.github/instructions/design.instructions.md`; add commands `npm run web:dev`, `web:build`, `web:test`, `web:typecheck` to "Comandos oficiais"; keep every existing principle unchanged. **Stop and get human approval of this amendment before T003.**
- [X] T002 Verify baseline: `npm run typecheck` and `npm run test` green on the current tree; note the store pattern in `src/store/sqlite-request-store.ts` (idempotent DDL, prepared statements, `migrate`, `OPSPILOT_DB` default, `close()`) and the `AsyncLocalStorage` pattern in `src/http/request-context.ts` to mirror in this feature
- [X] T003 Scaffold `web/` as a standalone npm project: `web/package.json` (`"type": "module"`, scripts `dev`=`vite`, `build`=`tsc -b && vite build`, `preview`=`vite preview`, `test`=`vitest run`, `typecheck`=`tsc -b --noEmit`), dependencies `react`, `react-dom`, `zod` (major 4), `react-markdown`; devDependencies `vite`, `@vitejs/plugin-react`, `typescript` (same major as root), `@types/react`, `@types/react-dom`, `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `vitest-axe`; run `npm --prefix web install` to create `web/package-lock.json`
- [X] T004 [P] Create `web/tsconfig.json` (strict, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `types: ["vite/client", "vitest/globals"]`, `include: ["src"]`, `resolveJsonModule: true`) and `web/src/vite-env.d.ts` declaring `ImportMetaEnv.VITE_OPSPILOT_API_URL?: string`
- [X] T005 [P] Create `web/vite.config.ts` with `base: "/opspilot/"`, `plugins: [react()]`, `server.port: 5173`, `preview.port: 4173`, `test: { environment: "jsdom", globals: true, setupFiles: ["src/test/setup.ts"], css: { modules: { classNameStrategy: "non-scoped" } } }` and `server.fs.allow: [".."]` so tests/dev can import `../specs/014-war-room-web/contracts/fixtures/*.json`
- [X] T006 [P] Create `web/index.html` with `<html lang="pt-BR">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<meta name="color-scheme" content="light dark">`, `<title>OpsPilot — War Room</title>`, an inline script **before** the bundle that reads `localStorage["opspilot.theme"]` inside `try/catch` and sets `document.documentElement.dataset.theme` to `light`/`dark` (or leaves it unset for `system`) to avoid a wrong-theme flash, `<div id="root">` and `<script type="module" src="/src/main.tsx">`
- [X] T007 [P] Add root scripts in `package.json`: `"web:dev": "npm --prefix web run dev"`, `"web:build": "npm --prefix web run build"`, `"web:test": "npm --prefix web run test"`, `"web:typecheck": "npm --prefix web run typecheck"`; append `web/dist` and `web/node_modules` to `.gitignore`; leave root `tsconfig.json` `include: ["src/**/*.ts"]` unchanged

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: design tokens, shell acessível, esquemas Zod e cliente HTTP, usados por todas as stories da web.

**⚠️ CRITICAL**: nenhuma story da web começa antes desta fase. As stories da API (US5-API, US3-API) dependem só da Phase 1.

- [X] T008 Create `web/src/styles/tokens.css` defining on `:root` the spacing scale `--space-0..16` (0,4,8,12,16,24,32,48,64px), type scale `--text-xs..2xl` with line heights from the design instructions, weights 400/500/600, radii `--radius-control: 4px`, `--radius-card: 8px`, `--radius-pill: 9999px`, and semantic colors `--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-accent`, `--color-focus`, `--color-danger`, `--color-warning`, `--color-success`, `--color-info` (+ `-subtle` backgrounds) for light; redefine the colors for dark under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` and again under `:root[data-theme="dark"]` (bg ≈ `#0f1115`, text ≈ 90% luminance, raised surfaces lighter, desaturated status colors), every text/background pair ≥ 4.5:1 and UI/focus ≥ 3:1 in both themes
- [X] T009 [P] Create `web/src/styles/global.css`: `color-scheme: light dark`, `body { background: var(--color-bg); color: var(--color-text); font: var(--text-base)/1.5 system-ui }`, `:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px }`, `.visually-hidden`, `font-variant-numeric: tabular-nums` utility, `@media (prefers-reduced-motion: reduce)` disabling transitions/animations, no horizontal page scroll at 320px
- [X] T010 [P] Create `web/src/test/setup.ts` importing `@testing-library/jest-dom/vitest` and extending `expect` with `vitest-axe` matchers; and `web/src/test/fixtures.ts` re-exporting `chat-202.json`, `decision-approve-200.json`, `decision-409.json` from `../../../specs/014-war-room-web/contracts/fixtures/` plus a hand-written `chat200` fixture containing one event of every `TraceEvent` type (route, thought, action, observation, plan with 3 step statuses, critique, fallback, summarize, answer) and an unknown `{ type: "telemetry", foo: 1 }`
- [X] T011 Create `web/src/api/schemas.ts` with Zod schemas per `specs/014-war-room-web/contracts/chat-http.md` and `approvals-http.md`: `graphNodeSchema`, `knownTraceEventSchema` (discriminated union of the 9 types), `traceEventSchema` = known union **or** fallback `z.object({ type: z.string() }).passthrough()` tagged as `{ kind: "unknown" }`, `metricsSchema` (optional fields tolerated), `approvalSchema`, `chatOkSchema` (200), `chatPendingSchema` (202, `status: "pending_approval"`), `decisionOkSchema` (200 + `approval`), `decisionPendingSchema` (202 + `decided`), `apiErrorSchema` (`error`, `code?`, `issues?`, `requestId?`, `approval?`, `approvalId?`); export inferred types
- [X] T012 [P] Add tests `web/src/api/schemas.test.ts`: all JSON fixtures parse with the matching schema; `chat200` keeps every known event typed and the unknown event as fallback without throwing; a body missing `answer` fails `chatOkSchema`
- [X] T013 Create `web/src/api/errors.ts` with pure `toUiError(input: { kind: "http"; status; body } | { kind: "network" } | { kind: "aborted" } | { kind: "bad-response"; requestId? }) → UiError { code, title, description, action: "retry" | "new-conversation" | "open-settings" | "decide-approval", requestId? }` implementing the mapping table in `specs/014-war-room-web/data-model.md#uierror` (pt-BR texts answering "o que aconteceu / o que isso afeta / o que fazer"; never returns raw backend messages as the title)
- [X] T014 [P] Add tests `web/src/api/errors.test.ts`: one case per row of the data-model table (400, 404 `CONVERSATION_NOT_FOUND`, 409 `APPROVAL_PENDING`, 422, 502 both codes, 503 `MODEL_SERVICE_UNAVAILABLE`, 504, 500, network, aborted, bad-response) asserting `code`, `action` and that `requestId` is carried over from body or argument
- [X] T015 Create `web/src/api/client.ts` exporting `createApiClient({ baseUrl, fetch = globalThis.fetch })` with `postChat(body, { signal })`, `postDecision(id, decision, { signal })`, `getApproval(id)`, `ping()` (`GET /stats?since=1m`, 5 s timeout); each call uses `AbortSignal.any([signal, AbortSignal.timeout(190_000)])`, reads `X-Request-Id` from headers, parses JSON safely, validates with the schemas from T011 and returns a discriminated `ApiResult` (`{ ok: "final" | "pending", data, requestId }` or `{ ok: false, error: UiError }` via `toUiError`); never throws for HTTP/network errors
- [X] T016 [P] Add tests `web/src/api/client.test.ts` with an injected fake `fetch`: 200 → `final`, 202 → `pending`, 409/5xx → `UiError` with `requestId` from header when body lacks it, `TypeError` from fetch → `network`, abort → `aborted`, invalid JSON / schema mismatch → `bad-response`; URL joining strips duplicate slashes
- [X] T017 Create `web/src/state/settings.ts`: pure `parseApiUrl(input) → { ok: true, url } | { ok: false, message }` (Zod: `http:`/`https:` only, no credentials, trailing slash removed), `DEFAULT_API_URL = import.meta.env.VITE_OPSPILOT_API_URL ?? "http://localhost:3000"`, `loadSettings()`/`saveSettings()` wrapping every `localStorage` access in `try/catch` and reporting `persisted: false` when storage is unavailable, and a `useSettings()` hook applying `document.documentElement.dataset.theme`
- [X] T018 [P] Add tests `web/src/state/settings.test.ts`: `parseApiUrl` accepts `http://localhost:3000/` (→ no trailing slash) and `https://api.x.com`, rejects `ftp://x`, `javascript:alert(1)`, `http://user:pw@x`, empty; load/save round-trip; throwing `localStorage` falls back to defaults with `persisted: false`
- [X] T019 Create the app shell `web/src/main.tsx` (imports `tokens.css`, `global.css`, renders `<App/>` in `StrictMode`) and `web/src/App.tsx` + `web/src/App.module.css` with the landmarks from `specs/014-war-room-web/contracts/web-ui.md` (skip link "Pular para a conversa", `<header>` with title "OpsPilot — War Room" as the only `h1`, placeholders for "Nova conversa" and "Configurações", `<main>`), responsive at 320px with `--space-4` gutters
- [X] T020 [P] Add test `web/src/App.test.tsx`: renders one `h1`, landmarks `banner` and `main`, skip link targets the conversation, and `axe` reports no violations

**Checkpoint**: `npm run web:typecheck && npm run web:test` green; API unchanged.

---

## Phase 3: User Story 5 - Publicação sob /opspilot/ e CORS (Priority: P1)

**Goal**: a war room funciona sob `/opspilot/` e a API aceita chamadas de navegador **só** das origens autorizadas.

**Independent Test**: build servido sob `/opspilot/` carrega todos os assets; preflight de origem permitida → 204 com `Allow-Origin` e `Expose-Headers: X-Request-Id`; origem não permitida → 403/sem cabeçalhos; sem `Origin` → inalterado; `*` derruba a inicialização.

### Tests for User Story 5 ⚠️

> Escrever primeiro e confirmar que falham.

- [X] T021 [P] [US5] Create `src/http/cors.test.ts` (table-driven) for pure `parseCorsOrigins(env)` and `corsHeadersFor(origin, method, allowlist)` covering every row of `specs/014-war-room-web/contracts/cors.md`: default list when unset/empty, trimming and dedup of comma list, rejection (throws `Error` with a clear message) of `*`, paths, query, credentials, non-http schemes; allowed simple → headers with `Vary: Origin` + `Access-Control-Expose-Headers: X-Request-Id`; allowed `OPTIONS` → status 204 + methods/headers/max-age; disallowed simple → only `Vary: Origin`; disallowed `OPTIONS` → 403; no origin → no headers; never `*`, never `Allow-Credentials`
- [X] T022 [P] [US5] Add tests in `src/http/server.test.ts` using `createApp(..., { corsOrigins: ["http://localhost:5173"] })`: `OPTIONS /chat` from allowed origin → 204 with headers; `POST /chat` from allowed origin → 200 with `Access-Control-Allow-Origin` and `X-Request-Id` exposed; `OPTIONS /chat` from `https://evil.example` → 403 without `Access-Control-Allow-Origin`; `GET /stats` without `Origin` → same status/body as before and no CORS headers
- [X] T023 [P] [US5] Add test `web/src/build.test.ts` (Vitest, node environment) that reads `web/vite.config.ts` resolved config via `loadConfigFromFile` and asserts `base === "/opspilot/"`

### Implementation for User Story 5

- [X] T024 [US5] Create `src/http/cors.ts` exporting `DEFAULT_CORS_ORIGINS` (`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173`, `http://127.0.0.1:4173`), pure `parseCorsOrigins(raw: string | undefined): string[]` (Zod-validated origins, `new URL(x).origin === x`, `*` rejected), pure `corsHeadersFor(...) → { status?: 204 | 403; headers: Record<string, string> }`, and `corsMiddleware(allowlist)` that applies the headers and ends `OPTIONS` with the given status, otherwise `next()`
- [X] T025 [US5] Wire CORS in `src/http/server.ts`: add `corsOrigins?: string[]` to `ChatServerOptions` (default `parseCorsOrigins(process.env.OPSPILOT_CORS_ORIGINS)`), register `corsMiddleware` right after `requestIdMiddleware` and before `chatAuditMiddleware`/`express.json()` so preflights are neither audited nor body-parsed; all existing tests stay green
- [X] T026 [US5] In `src/index.ts`, parse `OPSPILOT_CORS_ORIGINS` once at startup (fail fast with the parse error message and `process.exit(1)` if invalid), pass `corsOrigins` to `createApp`, and log the active origins in the startup line; add `OPSPILOT_CORS_ORIGINS=` with a comment to `.env.example` (do not read `.env`)
- [X] T027 [US5] Document the deployment in `web/README.md`: `VITE_OPSPILOT_API_URL` at build time, `OPSPILOT_CORS_ORIGINS` on the API, static fallback of `/opspilot/*` to `/opspilot/index.html` (nginx snippet from `specs/014-war-room-web/quickstart.md`)

**Checkpoint**: `npm run test` verde com CORS; `npm run web:build` gera `web/dist/index.html` com assets em `/opspilot/assets/`.

---

## Phase 4: User Story 1 - Conversar com o OpsPilot pelo navegador (Priority: P1) 🎯 MVP

**Goal**: enviar mensagens a `/chat`, ver as respostas em sequência na mesma conversa, com estados vazio, carregando e erro completos.

**Independent Test**: com a API mockada pelos fixtures, enviar duas mensagens e verificar a mesma `conversationId` reutilizada; cada classe de erro mostra a mensagem certa com "Tentar novamente"; "Nova conversa" limpa tudo.

### Tests for User Story 1 ⚠️

- [X] T028 [P] [US1] Add tests `web/src/state/conversation.test.ts` for the pure `conversationReducer`: `send` appends a person message `sending` and sets `inFlight`; `final` appends the agent message with `requestId/route/metrics/trace` and stores `conversationId`; `failed` marks the person message `error` with `UiError`, keeping its text; `retry` resends the same text; `reset` clears messages and `conversationId`; empty/whitespace text is ignored; a second `send` while `inFlight` is ignored
- [X] T029 [P] [US1] Add component tests `web/src/components/Chat/Chat.test.tsx` with a fake client: empty state shows heading "Como posso ajudar no plantão?" and 3 example buttons (click sends); typing + `Ctrl+Enter` sends; "Enviar" disabled for empty text and while waiting; "processando" appears only after 300 ms (fake timers) and "Ainda trabalhando…" + "Parar de esperar" after 10 s; the second message carries the `conversationId` from the first response; 504 shows "O agente demorou demais" with "Tentar novamente" and copyable request id; network error offers "Abrir configurações"; agent text with `<img onerror>` / `<script>` renders as inert text (no element created); `axe` passes in light and `data-theme="dark"`

### Implementation for User Story 1

- [X] T030 [US1] Create `web/src/state/conversation.ts` with the types `Message`/`Conversation` from `specs/014-war-room-web/data-model.md`, the pure `conversationReducer` and a `useConversation(client)` hook that dispatches `send`, calls `client.postChat({ message, conversationId })` with an `AbortController`, dispatches `final`/`failed`, exposes `stopWaiting()` (abort → `aborted` error) and `reset()`
- [X] T031 [P] [US1] Create `web/src/components/EmptyState/EmptyState.tsx` + `.module.css`: decorative icon `aria-hidden`, heading, one sentence, 3 example prompts ("Quais alertas estão disparando?", "Liste os incidentes abertos", "Consulte o runbook do checkout") as buttons calling `onPick(text)`
- [X] T032 [P] [US1] Create `web/src/components/ErrorNotice/ErrorNotice.tsx` + `.module.css`: `role="alert"`, title, description, action button by `UiError.action` ("Tentar novamente" / "Nova conversa" / "Abrir configurações"), and `<details>` "ID da requisição" with the id in `<code>` and a "Copiar" button (`navigator.clipboard.writeText` in `try/catch`, `role="status"` feedback "Copiado"); visually distinct from the danger color reserved for incident severity (uses `--color-warning`/neutral surface)
- [X] T033 [P] [US1] Create `web/src/components/AgentMessage/AgentMessage.tsx` + `.module.css`: `article` with the answer rendered by `react-markdown` **without** `rehype-raw` and with `skipHtml`, `<time dateTime>` with relative + absolute (`title`) time, and a slot for the "Ver raciocínio" button (wired in US2); person messages right-aligned on `--color-surface-raised`
- [X] T034 [US1] Create `web/src/components/Composer/Composer.tsx` + `.module.css`: `form` named "Enviar mensagem", visible `<label>` "Mensagem" for the `textarea`, "Enviar" button, `Ctrl/Cmd+Enter` submit, disabled reasons passed as `disabledReason` and announced via `aria-describedby`; min target 44×44 for "Enviar"
- [X] T035 [US1] Create `web/src/components/Chat/Chat.tsx` + `.module.css` composing ChatLog (`section` "Conversa" with `role="log"` + `aria-live="polite"`), EmptyState, AgentMessage, ErrorNotice, the delayed "processando" indicator (skeleton row, 300 ms delay, 10 s "Ainda trabalhando…" + "Parar de esperar"), and Composer; auto-scroll to the newest message unless the user scrolled up
- [X] T036 [US1] Wire `Chat` into `web/src/App.tsx`: create the API client from `useSettings().apiUrl`, "Nova conversa" button in the header calls `reset()` and moves focus to the composer; the `open-settings` error action opens the settings dialog placeholder (completed in US4)

**Checkpoint**: MVP (US5 + US1): conversa funcional contra a API real em dev (`npm run dev` + `npm run web:dev`).

---

## Phase 5: User Story 2 - Ver o raciocínio de uma resposta (Priority: P1)

**Goal**: "Ver raciocínio" abre um painel com o trace tipado, a etapa de cada passo e as métricas.

**Independent Test**: com o fixture `chat200`, abrir o painel e verificar um item com rótulo correto para cada tipo, o evento desconhecido genérico, as métricas no topo, conteúdo longo recolhido e `Esc` devolvendo o foco.

### Tests for User Story 2 ⚠️

- [X] T037 [P] [US2] Add tests `web/src/components/TraceStep/describe.test.ts` for pure `describeTraceEvent(event) → { label, nodeLabel?, body: { kind: "text" | "tool" | "plan" | "route" | "fallback" | "unknown", ... } }`: labels Rota/Pensamento/Ação/Observação/Plano/Crítica/Troca de modelo/Resumo/Resposta/"Evento: telemetry"; node labels Contexto/Roteador/ReAct/Plano e execução/Reflexão/Resposta; `APPROVAL_REQUIRED`/`DENIED` observations flagged `highlight: "approval"`
- [X] T038 [P] [US2] Add component tests `web/src/components/ReasoningPanel/ReasoningPanel.test.tsx`: opens from "Ver raciocínio" as a dialog named "Raciocínio"; renders an `ol` with one `li` per event in order; plan steps show text status (Pendente/Concluído/Falhou), not only color; action args rendered as formatted JSON in `pre`; content > 600 chars collapsed with "Mostrar tudo"; metrics summary shows model, LLM calls, prompt tokens, latency with `tabular-nums`; empty trace shows the explanatory empty state; `Esc` closes and focus returns to the trigger; `axe` passes in both themes

### Implementation for User Story 2

- [X] T039 [US2] Create `web/src/components/TraceStep/describe.ts` with pure `describeTraceEvent` and `TraceStep.tsx` + `.module.css` rendering each `body.kind` (text, tool name + args `pre`, plan list with status text + icon, route with reason, fallback "de → para" + reason, unknown as key/value JSON), label badge with text, node chip, collapse > 600 chars with "Mostrar tudo"/"Mostrar menos"
- [X] T040 [P] [US2] Create `web/src/components/MetricsSummary/MetricsSummary.tsx` + `.module.css`: `dl` with Modelo, Chamadas ao modelo, Tokens do prompt, Latência (formatted `1,2 s`), Rota; omits absent fields
- [X] T041 [US2] Create `web/src/components/ReasoningPanel/ReasoningPanel.tsx` + `.module.css` using native `<dialog>` with `showModal()` (focus trap, `Esc`), `aria-labelledby`, side sheet ≥ 1024px and full-screen below, MetricsSummary on top, `ol` of TraceStep, empty state; returns focus to the opener on close
- [X] T042 [US2] Add the "Ver raciocínio" button to `web/src/components/AgentMessage/AgentMessage.tsx` and manage the open panel (one at a time) in `web/src/components/Chat/Chat.tsx`

**Checkpoint**: US1 + US2 funcionando de forma independente.

---

## Phase 6: User Story 3 - Aprovar ou negar uma ação pendente (Priority: P2)

**Goal**: a API pausa `resolve_incident`/`forget_preference`, responde 202, aceita a decisão exatamente uma vez e retoma o agente; a web mostra o cartão e bloqueia a conversa até decidir.

**Independent Test (API)**: com um modelo/estratégia fake que chama `resolve_incident`, `POST /chat` → 202 com `approval` e incidente ainda aberto; `approve` → incidente resolvido uma vez e 200; segunda decisão → 409; `deny` em outra → nunca executa. **(Web)**: com o fixture `chat-202`, o cartão aparece, o composer bloqueia, "Aprovar" → estado Aprovado e a resposta final na conversa.

### Tests for User Story 3 (API) ⚠️

- [X] T043 [P] [US3] Create `src/store/approval-store.test.ts` running the same suite against `new SqliteApprovalStore(":memory:")` and `new FakeApprovalStore()`: `create` → `pending` with ISO `createdAt`; `get` unknown → `undefined`; `claim` succeeds once and returns `false` on the second call (no state change); `complete` sets `status/result/resumeRequestId/decidedAt`; `findPending(conversationId, now)` ignores decided and expired rows; SQLite rejects `tool` outside the 2 sensitive tools; reopening the same file path keeps the schema idempotent
- [X] T044 [P] [US3] Create `src/approvals/approval-gate.test.ts` for pure `decideGate(ctx, call)` and `withApprovalGate(tool)`: no grant → `hold` (first) and returns the `APPROVAL_REQUIRED` observation without calling the underlying tool, recording `pending` with `reason` (from args or undefined) and args **without** `reason`; second sensitive call in the same turn → `hold` (not first), pending unchanged; approved grant with the same canonical args → `replay` returns the stored result without calling the tool; denied grant → `DENIED` observation; non-sensitive tools are never wrapped; argument order does not affect matching
- [X] T045 [P] [US3] Create `src/approvals/approval-service.test.ts` for pure `applyDecision(approval, decision, now, ttlMinutes)` (pending→approved/denied; decided → `ApprovalAlreadyDecidedError`; expired → `ApprovalExpiredError`) and for `createApprovalService({ approvals, conversations, executeTool, runTurn, now })`: approve claims, calls `executeTool` exactly once inside `runWithUserId(storedUserId)`, appends `[decisão] ...` (role `user`) to the conversation, runs the resume turn with the grant, and completes with `resumeRequestId`; deny never calls `executeTool`; a throwing tool → `status: failed` with the message as `result` and the agent still resumed; concurrent double approve → exactly one `executeTool` call
- [X] T046 [P] [US3] Add tests in `src/http/server.test.ts` with injected fake strategies that call the gated `resolve_incident`: `POST /chat` → 202 body matching `contracts/chat-http.md` (`status: "pending_approval"`, `approval.status: "pending"`, trace contains the action and the `APPROVAL_REQUIRED` observation) and the ops store incident still open; `POST /chat` again on that conversation → 409 `APPROVAL_PENDING` with `approvalId` and nothing appended; `open_incident` executes without 202; `GET /requests/:requestId` of the 202 returns the partial trace
- [X] T047 [P] [US3] Create `src/http/approvals.test.ts`: `POST /approvals/:id/decision` approve → 200 with final answer and `approval.status: "approved"`, incident resolved exactly once; deny → 200, `approval.status: "denied"`, incident still open; second decision → 409 `APPROVAL_ALREADY_DECIDED` with `approval`; unknown id → 404 `APPROVAL_NOT_FOUND`; non-UUID id or body `{ decision: "maybe" }` or extra keys → 400 with `issues`; expired (injected `now`) → 409 `APPROVAL_EXPIRED`; resume turn throwing `ModelUnavailableError` → 503 while `GET /approvals/:id` already shows the decision; every response carries `X-Request-Id`; the decision request is persisted in the request store
- [X] T048 [P] [US3] Create `src/http/approvals.contract.test.ts` that reads `specs/014-war-room-web/contracts/fixtures/*.json` and asserts the real 202 / decision 200 / 409 bodies produced by `createApp` with fakes have the same key set and value types as the fixtures (ignoring ids, timestamps and free text)

### Implementation for User Story 3 (API)

- [X] T049 [US3] Create `src/store/approval-store.ts` with types `ApprovalStatus`, `Approval`, `ApprovalInput`, interface `ApprovalStore` (`create`, `get`, `findPending`, `claim`, `complete`, `close`), `SENSITIVE_TOOLS = ["resolve_incident", "forget_preference"] as const`, error codes `APPROVAL_NOT_FOUND`/`APPROVAL_ALREADY_DECIDED`/`APPROVAL_EXPIRED`/`APPROVAL_PENDING` and `DomainError` subclasses carrying the `Approval` when relevant, plus pure `isExpired(approval, now, ttlMinutes)` and `toApprovalView(approval, now, ttl)` (derives `expired`)
- [X] T050 [US3] Create `src/store/sqlite-approval-store.ts` implementing `ApprovalStore` with the `approvals` DDL from `specs/014-war-room-web/data-model.md` (`CREATE TABLE IF NOT EXISTS`, CHECKs, index), prepared statements only, `claim` as `UPDATE approvals SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'` returning `changes === 1`, path from `OPSPILOT_DB` with default `./data/opspilot.db`
- [X] T051 [P] [US3] Create `src/store/fake-approval-store.ts` with the same semantics (including synchronous single-winner `claim` and the tool CHECK) for deterministic tests
- [X] T052 [US3] Create `src/approvals/approval-gate.ts`: `ApprovalContext` (`grants`, `pending`, `held: Array<{tool,args}>`) in an `AsyncLocalStorage`, `runWithApprovalContext(ctx, fn)`, `getApprovalContext()`, pure `canonicalArgs(args)` (sorted keys, `reason` removed), pure `decideGate(ctx, call)`, the fixed observation strings `APPROVAL_REQUIRED_OBSERVATION(tool)` / `DENIED_OBSERVATION(tool)`, and `withApprovalGate(tool)` returning a LangChain `tool(...)` with the same name/description/schema that consults the context (outside any context → executes normally, preserving CLI/arena/bench/MCP behavior)
- [X] T053 [US3] Update `src/agents/tools.ts`: add `reason: z.string().trim().min(1).optional().describe("Why this action is needed now (shown to the human approver).")` to `resolveIncidentSchema` and `forgetPreferenceSchema` without passing it to the stores; add option `approvalGate?: boolean` to `createTools` that wraps `resolveIncident` and `forgetPreference` with `withApprovalGate`; update `src/agents/index.ts` so `createAgentRegistry` accepts and forwards `approvalGate` and also returns the raw (ungated) `executeTool` from `createToolExecutor(createTools(store, { ...options, approvalGate: false }))` for the service
- [X] T054 [US3] Create `src/approvals/approval-service.ts`: pure `applyDecision`, `buildDecisionMessage(approval, outcome)` (`[decisão] A pessoa operadora APROVOU|NEGOU <tool> <args>. Resultado: ...`), `buildResumeMessage(originalMessage)` per `research.md` R2, and `createApprovalService({ approvals, conversations, executeTool, now, ttlMinutes })` with `createPending(...)` and `decide(id, decision, runTurn)` implementing claim → execute once (in `runWithUserId`) → `complete` → append decision → `runTurn(resumeMessage, grants)`
- [X] T055 [US3] Update `src/http/request-trace.ts`: in `toRequestRecord` treat `status === 200 || status === 202` as success for `route`, `metrics` and `trace`; add `approvalId?: string` to `ChatOutcome`; keep existing 013 tests green and add a 202 case to `src/http/request-trace.test.ts`
- [X] T056 [US3] Update `src/http/server.ts`: add `approvals?: ApprovalStore` (default `FakeApprovalStore`) and `approvalTtlMinutes?` (default from `OPSPILOT_APPROVAL_TTL_MINUTES` or 1440) to `ChatServerOptions`; in `chatHandler`, before running, return 409 `APPROVAL_PENDING` when `approvals.findPending(conversationId, now)` exists; run `runChat` inside `runWithApprovalContext({ grants: [] })`; when the context has `pending`, persist it via `createPending` (reason fallback: `pending.reason` → last `thought` in the trace → "O agente solicitou esta ação.") and reply 202 per `contracts/chat-http.md`; refactor `runChat` so the decision handler can reuse it with an injected message and grants
- [X] T057 [US3] Create `src/http/approvals.ts` (controller): Zod `z.uuid()` for `:id` and `z.object({ decision: z.enum(["approve","deny"]) }).strict()` for the body; `POST /approvals/:id/decision` calling `approvalService.decide` with a `runTurn` built from the refactored `runChat` (same timeout and error translation as `/chat`), replying 200/202 per `contracts/approvals-http.md`; `GET /approvals/:id`; translate the approval `DomainError`s to 404/409 with `requestId`; register both routes in `createApp` with `chatAuditMiddleware` mounted on `/approvals` so decisions are persisted
- [X] T058 [US3] Compose in `src/index.ts`: `new SqliteApprovalStore()` passed as `approvals`, registry created with `approvalGate: true`, `executeTool` passed to the service, `close()` on shutdown together with the other stores; MCP server (`src/mcp/server.ts`), arena and bench keep `approvalGate` off (unchanged behavior)

### Tests for User Story 3 (Web) ⚠️

- [X] T059 [P] [US3] Add tests `web/src/state/approval.test.ts` for the pure `approvalReducer` covering every transition in `specs/014-war-room-web/data-model.md#approvalcard` (pending→submitting→approved|denied; 409 already-decided → final state from `GET /approvals/:id`; 409 expired → expired; network/5xx → error → retry → submitting; decided cards ignore further clicks)
- [X] T060 [P] [US3] Add component tests `web/src/components/ApprovalCard/ApprovalCard.test.tsx` using `chat-202.json`, `decision-approve-200.json`, `decision-409.json`: card named "Aprovação necessária" shows "Resolver incidente inc-1", args in a `dl` (without `reason`), the reason, "Aprovar" and "Negar"; composer disabled with the explanation "Há uma decisão pendente"; clicking "Aprovar" disables both buttons with progress, then shows "Aprovado" + time and appends the final agent message; "Negar" shows "Negado"; 409 shows the final state without buttons; network error re-enables with an `ErrorNotice`; state changes announced in `role="status"`; `axe` passes in both themes

### Implementation for User Story 3 (Web)

- [X] T061 [US3] Create `web/src/state/approval.ts` with the `ApprovalCard` type, pure `approvalReducer`, pure `describeAction(tool, args)` ("Resolver incidente <id>", "Esquecer preferência: <preference>", fallback to the tool name) and extend `conversationReducer` in `web/src/state/conversation.ts` with `pending` (appends agent message with `approval`, sets `pendingApprovalId`) and `decided` (clears it, appends the resulting agent message, or a new card when the decision response is 202)
- [X] T062 [US3] Create `web/src/components/ApprovalCard/ApprovalCard.tsx` + `.module.css`: `article` with heading "Aprovação necessária", action sentence, `dl` of params, reason, buttons "Aprovar" (primary) and "Negar" (secondary, same size), final state badge with text + `<time>`, `role="status"` live region, `ErrorNotice` on error; uses `--color-warning-subtle` surface (never the incident-severity danger style)
- [X] T063 [US3] Wire approvals in `web/src/components/Chat/Chat.tsx` and `useConversation`: render the card for 202 messages, call `client.postDecision` / `client.getApproval`, block the Composer with `disabledReason` while `pendingApprovalId` is set, and map `409 APPROVAL_PENDING` from `/chat` to focusing the pending card

**Checkpoint**: SC-003 coberto por testes nas duas pontas; contrato validado pelos mesmos fixtures.

---

## Phase 7: User Story 4 - Configurar a URL da API pela engrenagem (Priority: P2)

**Goal**: engrenagem com URL da API (validada e persistida), testar conexão, restaurar padrão e tema.

**Independent Test**: salvar uma URL válida → persiste após recarregar e as chamadas usam o novo endereço; `ftp://x` bloqueado com erro no campo; trocar a URL com conversa ativa inicia nova conversa com aviso; tema aplicado e lembrado.

### Tests for User Story 4 ⚠️

- [X] T064 [P] [US4] Add component tests `web/src/components/SettingsDialog/SettingsDialog.test.tsx`: the "Configurações" button opens a dialog labelled "Configurações" showing the current URL (default when unset); invalid URL → error linked by `aria-describedby`, focus moves to the field, nothing saved; valid URL saved → `localStorage["opspilot.apiUrl"]` updated and next `postChat` uses it; changing URL with messages present shows the "nova conversa" notice and resets the conversation; "Restaurar padrão" restores `DEFAULT_API_URL`; "Testar conexão" shows the 3 outcomes from `contracts/web-ui.md` via fake `ping`; theme radio sets `data-theme` immediately and persists; unavailable storage shows "a configuração não será lembrada"; `Esc` closes returning focus to the gear; `axe` passes

### Implementation for User Story 4

- [X] T065 [US4] Create `web/src/components/SettingsDialog/SettingsDialog.tsx` + `.module.css`: native `<dialog>` with `aria-labelledby="settings-title"`, `input type="url"` labelled "URL da API" with hint showing the default, "Testar conexão" (result in `role="status"`), "Restaurar padrão", `fieldset` + `legend` "Tema" with radios Claro/Escuro/Sistema, "Salvar"/"Cancelar"; validation via `parseApiUrl`
- [X] T066 [US4] Wire settings in `web/src/App.tsx`: gear icon button with `aria-label="Configurações"` (44×44) in the header, open dialog from the header and from `open-settings` error actions, recreate the API client on URL change and call `reset()` with a `role="status"` notice when a conversation was active; apply theme through `useSettings()`

**Checkpoint**: todas as stories funcionais de forma independente.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T067 [P] Add `web/src/a11y.test.tsx` rendering the full app in 4 states (empty, conversation with error, reasoning panel open, pending approval card) × 2 themes (`data-theme="light"` and `"dark"`) and asserting zero `axe` violations (SC-008)
- [X] T068 [P] Review every `web/src/**/*.module.css` against `.github/instructions/design.instructions.md`: only `var(--space-*)`, `var(--text-*)`, `var(--color-*)`, `var(--radius-*)` tokens (no literal px outside tokens.css, no hex/rgb), `gap` instead of child margins, 320px without horizontal scroll, 200% zoom; fix deviations
- [X] T069 [P] Update `.github/copilot-instructions.md` and `CLAUDE.md`/agent context if present: mention `web/` (Vite + React + TS), the `web:*` commands, `OPSPILOT_CORS_ORIGINS`, `OPSPILOT_APPROVAL_TTL_MINUTES` and that `resolve_incident`/`forget_preference` require human approval over HTTP
- [X] T070 Run `npm run typecheck`, `npm run test`, `npm run web:typecheck`, `npm run web:test`, `npm run web:build` and confirm all green; confirm no test opens the default `OPSPILOT_DB` or reads `.env`, and that `src/mcp/server.ts`, `src/arena.ts` and `src/bench.ts` behave as before (SC-009)
- [ ] T071 Execute the manual scenarios 1–14, the CORS curls and the `/opspilot/` preview from `specs/014-war-room-web/quickstart.md`; record results and any deviation in `specs/014-war-room-web/checklists/requirements.md` notes
- [X] T072 Confirm FR/SC coverage against `specs/014-war-room-web/spec.md` and the contracts in `specs/014-war-room-web/contracts/`; review `src/store/sqlite-approval-store.ts` for bound parameters only and `web/src` for any `dangerouslySetInnerHTML` (must be none)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 (emenda) bloqueia T003+ (código de `web/`). T002 não tem dependência.
- **Foundational (Phase 2)**: depende de T003–T007. Bloqueia todas as tarefas **web** das stories.
- **US5 (Phase 3)**: a parte API (T021, T022, T024–T026) depende só de T002. A parte web (T023, T027) depende da Phase 2.
- **US1 (Phase 4)**: depende da Phase 2. Para teste manual contra a API real em outra origem, depende de T025.
- **US2 (Phase 5)**: depende de T033/T035 (AgentMessage e Chat da US1).
- **US3 (Phase 6)**: a parte API (T043–T058) depende só de T002 e de T025 (o mesmo `server.ts`, então editar em sequência). A parte web (T059–T063) depende da US1 (Chat e conversation).
- **US4 (Phase 7)**: depende de T017 (settings) e T036 (App com client).
- **Polish (Phase 8)**: depende das stories desejadas concluídas.

### User Story Dependencies

```text
Setup ─▶ Foundational ─┬─▶ US1 ─┬─▶ US2
                       │        ├─▶ US3-web ◀── US3-API ◀── T002
                       │        └─▶ US4
US5-API ◀── T002       └─▶ US5-web
```

### Within Each User Story

- Testes primeiro, falhando; depois modelo/store → serviço → controller/rotas → composição; na web: estado puro → componentes → integração no `Chat`/`App`.
- Arquivos compartilhados em sequência: `src/http/server.ts` (T025 → T056 → T057), `src/http/server.test.ts` (T022 → T046), `web/src/components/Chat/Chat.tsx` (T035 → T042 → T063), `web/src/App.tsx` (T019 → T036 → T066), `web/src/state/conversation.ts` (T030 → T061).

### Parallel Opportunities

- Phase 1: T004, T005, T006, T007 em paralelo após T003.
- Phase 2: T009, T010, T012, T014, T016, T018, T020 em paralelo com as implementações dos seus pares.
- **API e web em paralelo**: US5-API e US3-API (src/) podem andar ao mesmo tempo que Foundational, US1 e US2 (web/).
- US3-API: T043, T044, T045, T047, T048 juntos; T051 em paralelo com T050.
- US1: T031, T032, T033 juntos.

## Parallel Example: User Story 3 (API)

```text
Task: "T043 approval-store.test.ts (SQLite :memory: + fake)"
Task: "T044 approval-gate.test.ts (decideGate / withApprovalGate)"
Task: "T045 approval-service.test.ts (applyDecision / decide exactly-once)"
Task: "T047 approvals.test.ts (HTTP 200/202/400/404/409/503)"
Task: "T048 approvals.contract.test.ts (fixtures)"
# depois:
Task: "T050 sqlite-approval-store.ts"  ||  Task: "T051 fake-approval-store.ts"
```

## Parallel Example: User Story 1

```text
Task: "T028 conversation.test.ts"
Task: "T029 Chat.test.tsx"
# depois:
Task: "T031 EmptyState"  ||  Task: "T032 ErrorNotice"  ||  Task: "T033 AgentMessage"
```

## Implementation Strategy

### MVP First

1. Phase 1 (com a emenda aprovada) → Phase 2.
2. Phase 3 (US5): CORS e base `/opspilot/`. Sem isso, o navegador não fala com a API.
3. Phase 4 (US1): chat funcionando. **Parar e validar** com os cenários 1, 2 e 12 do quickstart.

### Incremental Delivery

1. MVP (US5 + US1) → demo.
2. US2 (raciocínio) → demo de transparência.
3. US3-API → os clientes HTTP já ficam protegidos pela aprovação, mesmo antes da UI.
4. US3-web → cartão aprovar/negar.
5. US4 → engrenagem e tema.
6. Polish → axe nos 2 temas, revisão de tokens e quickstart completo.

### Parallel Team Strategy

- Pessoa A (API): T021–T026, depois T043–T058.
- Pessoa B (web): Phase 2 → US1 → US2 → US3-web → US4.
- Ponto de encontro: os fixtures em `specs/014-war-room-web/contracts/fixtures/`, validados nas duas pontas (T012, T048).

## Notes

- `[P]` = arquivos diferentes, sem dependência incompleta.
- Commit ao fim de cada checkpoint, com `typecheck` e `test` verdes.
- Nunca ler `.env`, nunca usar o `OPSPILOT_DB` padrão em testes, nunca chamar o LLM real em testes.
- Nenhum `dangerouslySetInnerHTML`, nenhum `Access-Control-Allow-Origin: *`.

## Implementation deviations (2026-10-14)

- **T022 / T046**: os testes HTTP de CORS e de aprovação ficaram em `src/http/cors.test.ts` e `src/http/approvals.test.ts` (não em `server.test.ts`, que já passa de 1000 linhas). Cobertura idêntica à descrita.
- **T053 / T058**: em vez da opção `approvalGate` em `createTools`, o portão está sempre aplicado e é **inerte fora de um contexto de aprovação** (`AsyncLocalStorage`). Só o `/chat` e a decisão HTTP abrem esse contexto, então MCP, arena e bench executam como antes, sem flag. As ferramentas usam `resolveIncidentAgentSchema`/`forgetPreferenceAgentSchema` (com `reason`); os esquemas expostos pelo MCP não mudaram. O executor sem portão vem de `createOpsToolExecutor` em `src/agents/index.ts`.
- **T054**: a mensagem de decisão e a de continuação são enviadas juntas como a mensagem do turno retomado (uma única mensagem `user` começando com `[decisão]`).
- **vitest-axe → axe-core**: `vitest-axe` só existe na versão 0.1.0, sem manutenção. Os testes de acessibilidade usam `axe-core` diretamente, via helper `web/src/test/axe.ts`.
- **Teste instável pré-existente** (013): `a failing request store does not change the chat response…` comparava `metrics.latencyMs` entre duas execuções; agora ignora a latência.
- **T071 (parcial)**: as verificações automatizáveis do quickstart (CORS via curl, `/opspilot/` e redirect sem barra, assets) foram executadas com a API e o preview reais. Os cenários 1–14 no navegador com o modelo real ainda precisam ser executados por uma pessoa.
- **US5-1 (barra final)**: o preview do Vite devolvia 404 em `/opspilot`; adicionado redirect 301 para `/opspilot/` em `web/vite.config.ts` (dev e preview) e `location = /opspilot` no exemplo nginx.
