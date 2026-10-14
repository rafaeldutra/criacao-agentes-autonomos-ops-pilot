# Implementation Plan: War Room Web

**Branch**: `014-war-room-web` | **Date**: 2026-10-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-war-room-web/spec.md`

## Summary

Criar a **war room** em `web/`: uma aplicação de página única em Vite, React e TypeScript, publicada em `/opspilot/` e seguindo as [instruções de design](../../.github/instructions/design.instructions.md). Ela conversa com `POST /chat`, abre o trace tipado em "Ver raciocínio", mostra um cartão aprovar/negar quando a API responde 202 e permite configurar a URL da API pela engrenagem.

Do lado da API, a feature acrescenta:
1. Um **portão de aprovação na camada de ferramentas** para `resolve_incident` e `forget_preference`. A ação é bloqueada, o turno termina e a API responde 202 com a ação pendente persistida em SQLite.
2. `POST /approvals/:id/decision`, que faz uma reivindicação atômica, executa a ferramenta uma única vez se aprovada e retoma o agente num novo turno com a concessão. Também `GET /approvals/:id`.
3. 409 `APPROVAL_PENDING` no `/chat` enquanto houver uma decisão pendente.
4. **CORS por lista de origens** (`OPSPILOT_CORS_ORIGINS`, nunca `*`).

As decisões técnicas estão em [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript ESM strict. API em Node.js 22 LTS. Web com TS na mesma major da raiz, gerada pelo Vite para navegadores atuais.

**Primary Dependencies**: API (existentes): Express 5, Zod 4, LangChain/LangGraph e `node:sqlite`, sem dependências novas. Web (novas, isoladas em `web/package.json`): Vite, React, React DOM, Zod, react-markdown. Desenvolvimento: Vitest, @testing-library/react e user-event, jsdom, vitest-axe e @vitejs/plugin-react.

**Storage**: SQLite (`OPSPILOT_DB`) com a nova tabela `approvals`. Na web, `localStorage` só para `apiUrl` e tema; a conversa fica na memória da aba.

**Testing**: API com `node:test` via `tsx` (`npm run test`); web com Vitest, Testing Library e axe (`npm run web:test`). Fixtures de contrato compartilhados em `specs/014-war-room-web/contracts/fixtures/`.

**Target Platform**: API em servidor Node. Web em navegadores atuais (Chromium, Firefox, Safari, últimas 2 versões) e telas a partir de 320px.

**Project Type**: web-service existente mais um frontend SPA novo.

**Performance Goals**: primeira renderização da war room em menos de 2 s em rede local; abrir o painel de raciocínio com 100 passos em menos de 100 ms percebidos. A latência do chat é dominada pelo LLM (até 180 s).

**Constraints**: nunca `Access-Control-Allow-Origin: *`; uma única execução por ação aprovada; nenhum HTML cru renderizado; WCAG 2.2 AA nos dois temas; comportamento inalterado para clientes sem `Origin` (CLI e MCP); `npm run typecheck` e `npm run test` verdes.

**Scale/Scope**: uso interno de plantão (poucas pessoas simultâneas); 1 tela, 2 diálogos, cerca de 15 componentes; 3 endpoints novos ou alterados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Avaliação | Status |
|---|-----------|-----------|--------|
| I | Camadas explícitas | API: `http/approvals.ts` (controller) → `approvals/approval-service.ts` (service) → `store/approval-store.ts` + `sqlite-approval-store.ts` (model). Web: `api/` (cliente e esquemas) → `state/` (redutores) → `components/` (visão), o equivalente MVC no cliente | ✅ |
| II | Validação na fronteira | Zod em `:id`, no corpo da decisão e em `OPSPILOT_CORS_ORIGINS`; a web valida toda resposta da API com Zod | ✅ |
| III | Erros de domínio | `ApprovalNotFoundError`, `ApprovalAlreadyDecidedError`, `ApprovalExpiredError` e `ApprovalPendingError` (subclasses de `DomainError`), traduzidos em 404/409 na borda | ✅ |
| IV | Funções puras | `decideGate`, `applyDecision`, `isExpired`, `corsHeadersFor` e `parseCorsOrigins`; na web, `toUiError`, `approvalReducer`, `conversationReducer` e `describeTraceEvent` | ✅ |
| V | Teste é parte da tarefa | Toda função nova tem teste; contrato verificado nas duas pontas com os mesmos fixtures | ✅ |
| VI | Segurança por padrão | Reforçado: ações destrutivas passam a exigir aprovação humana; CORS sem `*`; nenhum `.env` lido nos testes | ✅ |
| VII | Spec antes de código | Spec 014 clarificada e este plano | ✅ |
| VIII | Pequeno e reversível | Mudanças aditivas; `reason` opcional; trace persistido também em 202 (mudança mínima em `toRequestRecord`) | ✅ |
| IX | Persistência local | `approvals` via `node:sqlite`/`DatabaseSync`, schema idempotente, statements preparados; testes com `:memory:` | ✅ |
| X | Reprodutibilidade | `FakeApprovalStore` com a mesma semântica do SQLite (inclui `claim` atômico); seed inalterado | ✅ |
| — | **Stack obrigatória** | A constituição 1.1.0 não prevê frontend. **Violação justificada** (ver Complexity Tracking) e resolvida pela emenda 1.2.0 proposta em [research.md R9](./research.md#r9-emenda-da-constituição) | ⚠️ justificada |

**Pós-design (Phase 1)**: reavaliado depois de [data-model.md](./data-model.md) e [contracts/](./contracts/). Nenhuma violação nova. O item "Stack obrigatória" continua dependente da emenda 1.2.0, que é a **primeira tarefa** e bloqueia o código de `web/`.

## Project Structure

### Documentation (this feature)

```text
specs/014-war-room-web/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-http.md
│   ├── approvals-http.md
│   ├── cors.md
│   ├── web-ui.md
│   └── fixtures/ (chat-202.json, decision-approve-200.json, decision-409.json)
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── approvals/
│   ├── approval-gate.ts          # NOVO: decideGate (puro), withApprovalGate, contexto AsyncLocalStorage
│   ├── approval-gate.test.ts
│   ├── approval-service.ts       # NOVO: createPending, decide (claim → execute → resume), applyDecision/isExpired (puros)
│   └── approval-service.test.ts
├── store/
│   ├── approval-store.ts         # NOVO: interface, tipos, erros de domínio
│   ├── sqlite-approval-store.ts  # NOVO: tabela approvals
│   ├── fake-approval-store.ts    # NOVO
│   └── approval-store.test.ts    # roda contra SQLite :memory: e fake
├── agents/
│   ├── tools.ts                  # `reason?` nos 2 esquemas; gate aplicado em resolveIncident/forgetPreference
│   └── index.ts                  # injeta o gate no registry
├── http/
│   ├── cors.ts                   # NOVO: parseCorsOrigins, corsHeadersFor (puros) + middleware
│   ├── cors.test.ts
│   ├── approvals.ts              # NOVO: POST /approvals/:id/decision, GET /approvals/:id
│   ├── approvals.test.ts
│   ├── approvals.contract.test.ts# valida respostas contra contracts/fixtures
│   ├── server.ts                 # CORS, rotas, 202/409 no /chat, audit em /approvals
│   └── request-trace.ts          # persistir trace em 202
└── index.ts                      # compõe SqliteApprovalStore e a lista de CORS

web/
├── package.json  tsconfig.json  vite.config.ts (base: '/opspilot/')  index.html (lang="pt-BR")
└── src/
    ├── main.tsx  App.tsx
    ├── styles/      tokens.css (escala, tipografia, cores claro/escuro)  global.css
    ├── api/         client.ts (fetch + timeout/abort)  schemas.ts (Zod)  errors.ts (toUiError)
    ├── state/       conversation.ts  approval.ts  settings.ts  (redutores puros + hooks)
    ├── components/
    │   ├── ChatLog/  Composer/  EmptyState/  ErrorNotice/  AgentMessage/
    │   ├── ReasoningPanel/  TraceStep/  MetricsSummary/
    │   ├── ApprovalCard/
    │   └── SettingsDialog/  ThemeToggle/
    └── test/        setup.ts  fixtures.ts (importa specs/014-.../contracts/fixtures)
```

**Structure Decision**: a API segue em `src/` no padrão de camadas existente. A war room é um projeto npm separado em `web/` (sem workspaces), para que suas dependências não afetem a API. A raiz ganha os atalhos `web:dev`, `web:build`, `web:test` e `web:typecheck` via `npm --prefix web`.

## Fases de implementação (para `/speckit-tasks`)

1. **Fundação**: emenda da constituição 1.2.0; scaffold de `web/` com tokens e tema; atalhos na raiz.
2. **US5 (P1), CORS e base**: `cors.ts` e middleware; `base` no Vite; teste do build.
3. **US1 (P1), chat**: cliente, esquemas, `toUiError`, ChatLog, Composer, EmptyState e ErrorNotice.
4. **US2 (P1), raciocínio**: TraceStep (todos os tipos e a reserva), ReasoningPanel e MetricsSummary.
5. **US3 (P2), aprovação, API**: store, gate, service, rotas, 202/409 no `/chat`, persistência em 202, contrato.
6. **US3 (P2), aprovação, web**: ApprovalCard, `approvalReducer` e bloqueio do Composer.
7. **US4 (P2), configurações**: SettingsDialog, persistência, testar conexão e tema.
8. **Polimento**: axe nos dois temas, checklist de design e quickstart completo.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Stack de frontend (Vite, React, Vitest, react-markdown) fora da "Stack obrigatória" 1.1.0 | A spec pede uma interface web e a pessoa definiu Vite + React + TS | HTML servido pelo Express sem build não atende ao trace tipado, aos estados ricos nem aos testes de componente com axe com a mesma qualidade; a emenda 1.2.0 formaliza a stack em vez de abrir exceção permanente |
| Segundo `package.json` (`web/`) | Isola as dependências do navegador da API | Workspaces mexeriam no lockfile da raiz e no `typecheck` atual (`include: src/**`) |
| Retomada por novo turno em vez de checkpoint do LangGraph | Garantir execução única e compatibilidade com as 3 estratégias | O checkpointer SQLite oficial depende de `better-sqlite3` (conflita com o princípio IX) e de retomada em grafos aninhados |
