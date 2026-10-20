# Implementation Plan: Modo Equipe com Supervisor

**Branch**: `016-team-supervisor-mode` | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/016-team-supervisor-mode/spec.md`

## Summary

Nova estratégia `team` em `src/team/`: um sub-`StateGraph` LangGraph com nó
`supervisor` (`withStructuredOutput` `{ next, brief }`) e três especialistas
(`analista`, `planejador`, `executor`) que leem e escrevem num `blackboard` no
estado do grafo. O isolamento de papéis é estrutural (cada especialista só
recebe o subconjunto de tools do seu papel; o planejador não recebe nenhuma);
o executor reusa `resolve_incident` já embrulhado por `withApprovalGate`, então
não há caminho sem aprovação. Cada decisão do supervisor vira um evento
`handoff` no trace; os passos dos especialistas saem com `node` = papel. O teto
é de 8 decisões do supervisor por turno: a 8ª é forçada a `done` (schema
restrito), assim como qualquer decisão após uma aprovação pendente. A rota
`team` entra em `PRODUCTION_ROUTES`, na tabela do roteador e no override do
cliente. A war room aceita o evento/rota/nós novos e renderiza o `handoff` em
"Ver raciocínio".

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS (API); TypeScript strict + React (web/)

**Primary Dependencies**: LangGraph (`StateGraph`, `Annotation`, `createReactAgent`), LangChain `withStructuredOutput`, Zod; reutiliza `createReactStrategy` (001), `withApprovalGate` (014), `withNode`/`drainFallbacks` (011/012), `createProductionGraph` (011)

**Storage**: blackboard vive só no estado do turno; trace persistido pelo caminho existente (013), com o CHECK de `requests.route` ampliado para `team` e migração por reconstrução da tabela (research R11)

**Testing**: `node:test` via `tsx` com modelos/decisores stub (sem rede); Vitest + Testing Library + vitest-axe na web

**Target Platform**: Node.js 22 LTS (HTTP local) + navegador (war room estática)

**Project Type**: Serviço HTTP de raciocínio operacional + SPA

**Performance Goals**: no máximo 8 chamadas de supervisor por turno + chamadas dos especialistas; cada especialista ReAct herda `maxIterations` (8) existente; timeout `/chat` inalterado (180s)

**Constraints**: nenhuma tool fora do papel alcançável pelo especialista (isolamento por construção, não por prompt); nenhum bypass do approval gate; rotas existentes inalteradas; brief/conteúdo nunca vão para logs (só metadados); conteúdo do brief renderizado como texto na web

**Scale/Scope**: 1 módulo novo (`src/team/`, ~5 arquivos), ajustes aditivos em `types.ts`, `trace.ts`, `production-graph.ts`, `agents/index.ts`, `http/server.ts`, `obs/logger.ts`; na web `schemas.ts`, `describe.ts`, `TraceStep.tsx`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Camadas explícitas**: PASS — HTTP compõe registry → grafo; `src/team/` é serviço de raciocínio sem IO de persistência; tools continuam o único acesso ao `OpsStore`.
- **II. Validação na fronteira**: PASS — `strategy` do body continua validado (Zod + `isStrategyRoute` → 422); saída do supervisor validada por Zod (`supervisorDecisionSchema`); web valida o evento `handoff` com Zod.
- **III. Erros de domínio**: PASS — decisão inválida do supervisor → `RouterError` (`ROUTER_FAILED` → 502) já existente; `ModelUnavailableError` preservado.
- **IV. Funções puras**: PASS — catálogo de papéis, seleção de tools, formatação do blackboard, regra de teto/forçar `done` e construção do evento `handoff` são puras; só os nós de modelo fazem IO.
- **V. Teste é parte da tarefa**: PASS — testes colocalizados para papéis, teto, approval, trace, rota, HTTP e web; `typecheck`/`test`/`web:test` verdes.
- **VI. Segurança por padrão**: PASS — reforça: isolamento estrutural por papel; executor herda o gate de aprovação; `forget_preference` fora da equipe; logs sem brief.
- **VII. Spec antes de código**: PASS — spec `016-team-supervisor-mode` aprovada.
- **VIII. Pequeno e reversível**: PASS — mudanças aditivas; rotas `react`/`plan-and-execute`/`reflect` intocadas; remover a rota `team` reverte a feature.
- **IX. Persistência local explícita**: PASS — único DDL é o CHECK de `requests.route` com `team`; schema idempotente e migração por reconstrução sem SQL montado a partir de entrada (R11).
- **X. Reprodutibilidade**: PASS — testes usam store em memória seed Mercadinho e stubs determinísticos.
- **Stack web**: PASS — Zod na resposta, CSS Modules/tokens, texto puro, vitest-axe.

**Pós-design (Phase 1)**: PASS — o design não introduz violações; Complexity Tracking vazio.

## Project Structure

### Documentation (this feature)

```text
specs/016-team-supervisor-mode/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── team-strategy.md     # contrato interno: papéis, supervisor, teto
│   ├── chat-http.md         # delta aditivo do /chat (rota, trace, nós)
│   └── web-ui.md            # delta do "Ver raciocínio"
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── team/                          # NOVO
│   ├── roles.ts                   # catálogo de papéis + seleção pura de tools por papel
│   ├── roles.test.ts
│   ├── blackboard.ts              # tipo Blackboard, append e render para prompt (puros)
│   ├── blackboard.test.ts
│   ├── supervisor.ts              # schema { next, brief }, prompt, decisor default, regra de teto
│   ├── supervisor.test.ts
│   ├── team-graph.ts              # sub-StateGraph supervisor ↔ especialistas; createTeamStrategy
│   ├── team-graph.test.ts         # fluxo, teto 8, approval pendente/negada, trace
│   └── index.ts
├── agents/
│   ├── types.ts                   # GraphNode/StrategyRoute + TraceEvent "handoff"
│   ├── trace.ts                   # handoff(), formatTrace
│   ├── react.ts                   # parâmetro tools aceita subconjunto
│   ├── production-graph.ts        # rota/nó "team", linha na tabela do roteador
│   └── index.ts                   # registry ganha "team"
├── http/server.ts                 # passa registry.team ao grafo
└── obs/logger.ts                  # traceEventMeta para handoff (sem brief)

web/src/
├── api/schemas.ts                 # rota "team", nós novos, evento handoff
└── components/TraceStep/
    ├── describe.ts                # labels "Equipe", papéis, body "handoff"
    └── TraceStep.tsx              # render do body handoff
```

**Structure Decision**: Projeto único Node (`src/`) + SPA em `web/`, como nas
features 011–015. O modo equipe fica isolado em `src/team/` (pedido explícito)
e é plugado no grafo de produção como mais uma `ReasoningStrategy`, sem alterar
o contrato das estratégias existentes.

## Complexity Tracking

Sem violações.
