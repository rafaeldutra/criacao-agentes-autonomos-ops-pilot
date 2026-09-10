# Implementation Plan: Reflection Layer

**Branch**: `002-reflection-layer` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)

## Summary

Adicionar um decorator `withReflection` que executa qualquer `ReasoningStrategy`, avalia a resposta e as observações com saída estruturada do mesmo modelo, registra críticas tipadas e regenera respostas rejeitadas até aprovação ou o limite configurado. A Arena ganhará aliases `reflect:react` e `reflect:plan-and-execute`, preservando os aliases existentes.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`, Zod, `tsx`, `node:test`

**Storage**: N/A; reflection is request-scoped and does not persist review state

**Testing**: Deterministic `node:test` doubles for strategies and critic models; `npm run typecheck`

**Target Platform**: Node.js 22 LTS CLI/server runtime

**Project Type**: TypeScript reasoning library and CLI arena

**Performance Goals**: Stop after the first approval; never exceed `maxReflections`; report critic and regeneration calls and total latency

**Constraints**: Default `maxReflections` is 2; no network in deterministic tests; preserve existing strategy contract; do not read `.env` from reflection code

**Scale/Scope**: Two existing strategies, two new Arena aliases, one reflection decorator, request-scoped traces and metrics

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas MVC**: PASS — reflection remains an agent service/decorator; Arena remains the CLI/controller boundary.
- **Validação na fronteira**: PASS — reflection options and structured critic output are validated before use.
- **Erros de domínio**: PASS — invalid options and malformed critic responses are explicit errors at the strategy boundary.
- **Funções puras**: PASS — critique aggregation, option validation, alias parsing, and trace composition are pure where possible.
- **Teste obrigatório**: PASS — deterministic decorator, retry, limit, metrics, and Arena alias tests are planned.
- **Segurança**: PASS — no secret persistence or direct `.env` reads; the existing model factory remains the only configuration boundary.
- **Spec antes de código**: PASS — implementation follows the approved feature specification.
- **Pequeno e reversível**: PASS — opt-in decorator preserves non-reflected behavior and existing aliases.

## Project Structure

```text
specs/002-reflection-layer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── reflection.md
│   └── arena.md
└── tasks.md

src/agents/
├── reflection.ts
├── reflection.test.ts
├── types.ts
└── trace.ts

src/arena.ts
└── arena.test.ts
```

**Structure Decision**: Keep reflection in `src/agents/reflection.ts` as a reusable strategy decorator. Extend the existing shared types and trace helpers only where needed. Keep alias selection in `src/arena.ts` and test it through the existing parser/registry boundary.

## Phase 0 — Research

1. Confirm the existing `ReasoningStrategy` result contract is sufficient for immutable trace and metric composition.
2. Define the structured critic payload and validation behavior using the project's existing Zod boundary convention.
3. Define how regeneration feedback is carried without changing the public strategy interface.
4. Define the exact metric accounting for critic calls and regenerated base calls.
5. Define Arena alias resolution and compatibility behavior for existing strategy names.

## Phase 1 — Design

- Model reflection options, critique results, attempts, and accumulated metrics in `data-model.md`.
- Document the decorator and Arena alias contracts in `contracts/`.
- Document deterministic validation scenarios and expected limits in `quickstart.md`.

## Constitution Check — Post-Design

- **Camadas MVC**: PASS — agent decorator, shared types, and CLI alias resolution remain separated.
- **Validação e erros**: PASS — options and critic outputs are validated; failures are explicit.
- **Funções puras e testes**: PASS — composition helpers and alias parsing are deterministic and tested without network.
- **Segurança**: PASS — no new environment or credential access is introduced.
- **Fluxo e versionamento**: PASS — all design artifacts are versioned under `specs/002-reflection-layer`.

## Complexity Tracking

No constitution violations require justification.
