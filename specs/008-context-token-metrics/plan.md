# Implementation Plan: Instrumentação de medição de contexto

**Branch**: `008-context-token-metrics` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-context-token-metrics/spec.md`

## Summary

Introduzir um módulo canônico `src/context/tokens.ts` com `estimateTokens`
(`Math.floor(chars / 4)`) e leitura do usage real LangChain
(`AIMessage.usage_metadata.input_tokens`). Estender as métricas do `POST /chat`
com `promptTokens` (real, omitido se ausente) e `contextBreakdown` estimado por
fonte do input composto (`memory` / `history` / `message`). Manter
`scripts/conversa-longa.sh` imprimindo `promptTokens` por turno. Cobertura
`node:test` + typecheck verde.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `@langchain/core` (`AIMessage.usage_metadata` /
`UsageMetadata.input_tokens`), Express, Zod (request já existente), `node:test` /
`tsx`

**Storage**: N/A — sem schema novo; métricas só na resposta HTTP do turno

**Testing**: `node:test`; unitários de tokens; HTTP com strategy stub que injeta
`promptTokens` / omite usage; sem LLM real obrigatório no CI

**Target Platform**: Node.js 22 LTS (HTTP + script bash local)

**Project Type**: Serviço HTTP de raciocínio operacional

**Performance Goals**: Estimativa e somatório O(n) no tamanho do contexto /
mensagens do turno; sem I/O extra

**Constraints**: `promptTokens` nunca preenchido por estimativa; breakdown só
do input composto do `/chat` (não tool calls internas); extensão aditiva de
`Metrics`; arena/bench/MCP fora do escopo obrigatório

**Scale/Scope**: Um módulo `context/`, extensão de `Metrics` + composição
HTTP + ajuste em `metricsFromMessages` / strategies que montam métricas;
script de demo já alinhado

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — estimativa/usage em `src/context/` (puro);
  composição de breakdown no HTTP; strategies só propagam usage das mensagens.
- **Validação na fronteira**: PASS — request `/chat` inalterado (Zod existente);
  usage malformado → tratado como ausente (defensivo, sem 5xx).
- **Erros de domínio**: PASS — ausência de usage não é erro; script usa `n/a`.
- **Funções puras**: PASS — `estimateTokens`, extractors e breakdown são puros.
- **Teste obrigatório**: PASS — FR-009 / SC-001–SC-006 cobertos por testes.
- **Segurança**: PASS — sem ler `.env`; métricas não expõem segredos além do
  já presente no fluxo de chat.
- **Spec antes de código**: PASS — plano baseado em `008-context-token-metrics`.
- **Pequeno e reversível**: PASS — aditivo; clientes legados ignoram campos novos.
- **Persistência local explícita**: PASS — sem mudança de store/schema.
- **Reprodutibilidade**: PASS — stubs determinísticos; estimativa regra fixa.

*Post-design re-check*: PASS — contratos/data-model não introduzem camadas
extra nem IO; gates mantidos.

## Project Structure

### Documentation (this feature)

```text
specs/008-context-token-metrics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── tokens.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts              # estimateTokens, usage real, contextBreakdown
│   └── tokens.test.ts
├── agents/
│   ├── types.ts               # Metrics + promptTokens? + contextBreakdown?
│   ├── strategy.ts            # metricsFromMessages soma input_tokens
│   ├── metrics.test.ts        # cobre promptTokens a partir de usage_metadata
│   ├── react.ts               # já usa metricsFromMessages
│   ├── plan-and-execute.ts    # propagar soma de usage quando disponível
│   └── reflection.ts          # somar promptTokens ao agregar métricas
├── http/
│   ├── chat-history.ts        # helper de texto de histórico sem mensagem atual
│   ├── server.ts              # merge contextBreakdown (+ promptTokens se strategy)
│   └── server.test.ts         # SC-002–SC-004
scripts/
└── conversa-longa.sh          # já imprime metrics.promptTokens; alinhar comentários
```

**Structure Decision**: Módulo novo `src/context/` (pedido explícito) concentra
regras puras. O HTTP calcula o breakdown a partir dos textos reais de memória /
histórico / mensagem usados na composição. Strategies enriquecem `promptTokens`
via mensagens LangChain; HTTP **não** inventa esse campo.

## Complexity Tracking

> Sem violações de constituição a justificar.

## Phase 0 — Research

Ver [research.md](./research.md): formato `UsageMetadata`, agregação multi-LLM,
fontes do breakdown, omissão vs null, escopo plan-and-execute/reflection.

## Phase 1 — Design

Ver [data-model.md](./data-model.md), [contracts/](./contracts/),
[quickstart.md](./quickstart.md).
