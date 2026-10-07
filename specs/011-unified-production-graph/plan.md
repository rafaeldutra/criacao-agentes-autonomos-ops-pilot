# Implementation Plan: Grafo unificado de produção

**Branch**: `011-unified-production-graph` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-unified-production-graph/spec.md`

## Summary

Unificar o turno de `/chat` num `StateGraph` LangGraph em
`src/agents/production-graph.ts`: nós `context` (reusa `buildContext` 010),
`router` (`withStructuredOutput` `{ route, reason }` + tabela no prompt, ou
override do cliente), as três estratégias (`react`, `plan-and-execute`,
`reflect`) e `response`. Trace ganha evento `route` e campo `node`. Omitir
`strategy` deixa de defaultar `react`. Arena/bench/MCP fora de escopo.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: LangGraph (`StateGraph`, `Annotation`), LangChain
`withStructuredOutput`, Zod, Express, `node:test`/`tsx`; reutiliza
`buildContext` (010), `withReflection` (002), registry (001/003)

**Storage**: N/A — sem schema novo; conversa/ops/memória inalterados

**Testing**: `node:test`; grafo e HTTP com `decideRoute` e strategies stub;
sem rede

**Target Platform**: Node.js 22 LTS (HTTP local)

**Project Type**: Serviço HTTP de raciocínio operacional

**Performance Goals**: +0 chamada LLM no override; +1 no roteamento automático
além da estratégia; timeout `/chat` inalterado (180s)

**Constraints**: Sem fallback silencioso se o roteador falhar; 422 para
strategy desconhecida antes do grafo; não duplicar `withReflection` na rota
`reflect`; não ler `.env` nos testes

**Scale/Scope**: 1 módulo de grafo + helpers de trace + wire em `runChat` /
`createApp`; testes colocalizados; contratos HTTP aditivos no trace

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — HTTP carrega stores; grafo em `src/agents/`
  monta contexto puro e executa estratégias; sem IO de persistência no grafo.
- **Validação na fronteira**: PASS — Zod do body inalterado; enumerado de
  override checado no handler → 422; schema Zod do roteador na saída LLM.
- **Erros de domínio**: PASS — `ROUTER_FAILED` → 502; 422/404/504 preservados.
- **Funções puras**: PASS — `withNode`, schema, tabela de prompt, `buildContext`
  já puro; nós de estratégia/router são o IO de modelo inevitável.
- **Teste obrigatório**: PASS — FR-014 / SC-006; stubs injetáveis.
- **Segurança**: PASS — sem segredos novos; override não muda allow/deny.
- **Spec antes de código**: PASS — baseado em `011-unified-production-graph`.
- **Pequeno e reversível**: PASS — `/chat` troca `strategy.run` por
  `graph.invoke`; Arena intacta; clientes com `strategy` explícito seguem
  forçando o modo.
- **Persistência local explícita**: PASS — N/A (sem DDL).
- **Reprodutibilidade**: PASS — testes com doubles; seed Mercadinho intocado.

*Post-design re-check*: PASS — contratos separam grafo, HTTP e trace; IO na
borda; `decideRoute` injetável evita LLM no CI.

## Project Structure

### Documentation (this feature)

```text
specs/011-unified-production-graph/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── production-graph.md
│   ├── chat-http.md
│   └── trace.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/agents/
├── types.ts                 # GraphNode, RouteDecision, TraceEvent + route/node
├── trace.ts                 # route(), withNode(), formatTrace
├── trace.test.ts
├── production-graph.ts      # NOVO: StateGraph context/router/strategies/response
├── production-graph.test.ts # NOVO
├── reflection.ts            # reutilizado no nó reflect
├── index.ts                 # createProductionGraph na composição se útil
└── react.ts / plan-and-execute.ts  # inalterados internamente
src/http/
├── server.ts                # runChat → graph.invoke; 502 ROUTER_FAILED; sem default react
└── server.test.ts           # decideRoute de teste; override; 422; 502; node
src/index.ts                 # createApp(registry) continua; grafo criado no server
```

**Structure Decision**: Grafo de produção como serviço de agentes, não como
segunda orquestração no controller. `createApp` constrói o grafo a partir do
registry (mais `withReflection` para o nó `reflect`) e aceita `decideRoute`
opcional para testes. `runChat` deixa de receber uma única `strategy` e passa
a invocar o grafo com override/reflect. Strategies existentes não precisam
saber de `node`; o grafo carimba na volta.

## Complexity Tracking

> Sem violações de constituição a justificar.
