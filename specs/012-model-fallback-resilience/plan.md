# Implementation Plan: Resiliência e Fallback de Modelos

**Branch**: `012-model-fallback-resilience` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-model-fallback-resilience/spec.md`

## Summary

`createOpenRouterModel()` passa a devolver um `ResilientModel`: dois
`ChatOpenAI` (primário `OPENROUTER_MODEL`, reserva
`OPENROUTER_MODEL_FALLBACK`, mesma chave/baseURL, `maxRetries: 0`) compostos
como `primary.withRetry(3 tentativas).withFallbacks([fallback])`, aplicados
*depois* de `bindTools`/`withStructuredOutput` para não perder tools e schemas.
Um escopo `AsyncLocalStorage` por turno registra `modelUsed` e as comutações;
o grafo de produção vira isso em eventos `fallback` (com `node`) e
`metrics.modelUsed`. Falha dos dois modelos lança `ModelUnavailableError`
(`MODEL_SERVICE_UNAVAILABLE`), traduzido para HTTP 503.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `@langchain/core` 1.2.9 (`withRetry`,
`withFallbacks`), `@langchain/openai` 1.5.11, `@langchain/langgraph` 1.4.14
(`createReactAgent` com `llm` dinâmico), Express, Zod, `node:async_hooks`

**Storage**: N/A — sem DDL; conversa/ops/memória inalterados

**Testing**: `node:test` via `tsx`; `BaseChatModel` dublês injetados em
`createResilientModel`; sem rede

**Target Platform**: Node.js 22 LTS (HTTP local)

**Project Type**: Serviço HTTP de raciocínio operacional

**Performance Goals**: caminho feliz sem custo extra (0 chamadas a mais);
retry só em erro; reserva com 1 tentativa

**Constraints**: retry único (`maxRetries: 0` no cliente); timeout `/chat`
(180s) precede o 503; nenhum estado degradado entre turnos; 503 sem vazar
stack/mensagem do provedor; testes não leem `.env`

**Scale/Scope**: 1 módulo novo (`model-usage.ts`), reescrita de `model.ts`,
ajustes pontuais em `types.ts`, `trace.ts`, `react.ts`,
`production-graph.ts`, `server.ts`, `.env.example`; testes colocalizados

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — resiliência no serviço de agentes
  (`src/agents/model.ts`); HTTP só traduz o erro.
- **Validação na fronteira**: PASS — body `/chat` inalterado; env validado
  fail-fast na fábrica.
- **Erros de domínio**: PASS — `ModelUnavailableError extends DomainError`
  → 503 no `chatHandler`; roteador deixa de mascará-lo como 502.
- **Funções puras**: PASS — classificação de erro retentável, sanitização do
  motivo e helper `fallback()` puros; IO limitado à chamada de modelo.
- **Teste obrigatório**: PASS — FR-012 coberto por `model.test.ts`,
  `model-usage.test.ts` e extensões de grafo/HTTP/trace.
- **Segurança**: PASS — nenhuma credencial nova (reusa
  `OPENROUTER_API_KEY`); `.env` não é lido nos testes; `.env.example` só com
  placeholder.
- **Spec antes de código**: PASS — spec `012-model-fallback-resilience`.
- **Pequeno e reversível**: PASS — superfície do modelo preservada
  (`invoke`/`bindTools`/`withStructuredOutput`); só ReAct muda a forma de
  passar o `llm`; contratos HTTP aditivos.
- **Persistência local explícita**: PASS — N/A.
- **Reprodutibilidade**: PASS — dublês determinísticos; seed intocado.

*Post-design re-check*: PASS — contratos separam fábrica, escopo de uso,
grafo e HTTP; erro de domínio único para falha total; escopo por turno evita
estado global.

## Project Structure

### Documentation (this feature)

```text
specs/012-model-fallback-resilience/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── model-resilience.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
.env.example                      # + OPENROUTER_MODEL_FALLBACK
src/agents/
├── model.ts                      # ResilientModel, createResilientModel, createOpenRouterModel, ModelUnavailableError
├── model.test.ts                 # NOVO
├── model-usage.ts                # NOVO: AsyncLocalStorage do turno
├── model-usage.test.ts           # NOVO
├── types.ts                      # TraceEvent "fallback"; Metrics.modelUsed
├── trace.ts / trace.test.ts      # fallback(); formatTrace
├── react.ts                      # llm dinâmico: () => model.bindTools(tools)
├── production-graph.ts           # runWithModelUsage; drainFallbacks nos nós; router relança 503
└── production-graph.test.ts
src/http/
├── server.ts                     # 503 MODEL_SERVICE_UNAVAILABLE; repassa modelUsed
└── server.test.ts
```

Somente tipo (sem mudança de comportamento): `plan-and-execute.ts`,
`reflection.ts`, `learning-reflector.ts`, `history-summarizer.ts`, `arena.ts`,
`bench.ts`, `index.ts`.

**Structure Decision**: A resiliência fica inteira na fábrica de modelos, que
continua sendo o único ponto que lê `process.env` para LLM. Consumidores
mantêm a mesma API; o rastreio sai do modelo por um escopo ALS por turno
(padrão já usado em `request-context.ts`), e só o grafo de produção o converte
em trace/métrica. Arena e bench ganham retry/fallback, mas sem expor eventos
`fallback` (fora de escopo).

## Complexity Tracking

> Sem violações de constituição a justificar.
