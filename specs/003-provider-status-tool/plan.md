# Implementation Plan: External Provider Status Tool

**Branch**: `003-provider-status-tool` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

## Summary

Adicionar `check_provider_status` ao conjunto de tools do OpsPilot para consultar status públicos de GitHub e Cloudflare. A tool terá schema Zod, mapeamento explícito de endpoints, timeout de cinco segundos, uma única tentativa adicional para falhas transitórias, validação do payload e retorno compacto de sucesso ou erro como observação. O transporte HTTP será injetável para testes determinísticos sem rede.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `@langchain/core`, Zod, Node fetch/AbortSignal, `node:test`, `tsx`

**Storage**: N/A; status checks are read-only and request-scoped

**Testing**: `node:test` via `tsx`, fake fetch implementations, `npm run typecheck`

**Target Platform**: Node.js 22 LTS runtime with native `fetch` and `AbortSignal.timeout`

**Project Type**: TypeScript agent tools library used by CLI and reasoning strategies

**Performance Goals**: Each attempt is bounded by five seconds; no more than two requests per invocation; successful output is one compact line

**Constraints**: Only `github` and `cloudflare`; GitHub is the default; only network/timeout/5xx failures retry; final failures never escape as uncaught tool exceptions; no credentials

**Scale/Scope**: One new tool, two endpoint mappings, one injectable fetch seam, deterministic success/retry/invalid-response tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — provider status remains a service/tool concern and is registered at the existing tools boundary.
- **Validação na fronteira**: PASS — provider input and remote response are validated with Zod.
- **Erros de domínio**: PASS — final provider failures become readable tool observations; they do not escape the tool.
- **Funções puras**: PASS — endpoint selection, response formatting, retry classification, and schema parsing are isolated where possible.
- **Teste obrigatório**: PASS — fake fetch tests cover success, timeout/retry, invalid response, and no-network behavior.
- **Segurança**: PASS — public read-only endpoints, no secrets, and no direct `.env` access.
- **Spec antes de código**: PASS — implementation follows the versioned feature specification.
- **Pequeno e reversível**: PASS — existing tools remain unchanged apart from additive registration.
- **Persistência/reprodutibilidade**: PASS — no operational persistence or seed behavior is changed.

## Project Structure

```text
specs/003-provider-status-tool/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── provider-status.md
└── tasks.md

src/agents/
├── tools.ts
└── tools.test.ts
```

**Structure Decision**: Keep the public LangChain tool and its input schema in `src/agents/tools.ts`, with private pure helpers and an injected fetch type in the same module unless the implementation proves a separate transport module is needed. Extend `src/agents/tools.test.ts` with fake-fetch cases beside existing tool tests.

## Phase 0 — Research

1. Confirm Statuspage API v2 payload and the exact fields to retain.
2. Define retry classification for network failures, abort timeouts, HTTP 5xx, other HTTP errors, JSON failures, and schema failures.
3. Define the injectable fetch signature compatible with native `fetch`.
4. Confirm tool error handling keeps final failures as strings while preserving schema rejection for invalid input.

## Phase 1 — Design

- Model providers, attempts, validated status payloads, and compact observations in `data-model.md`.
- Document input, endpoint, retry, output, and failure contracts in `contracts/provider-status.md`.
- Document fake-fetch validation scenarios and optional live smoke-test commands in `quickstart.md`.

## Constitution Check — Post-Design

- **Camadas e fronteira**: PASS — tool registration stays in `src/agents/tools.ts`; external input and response validation are explicit.
- **Erros e resiliência**: PASS — only the tool returns readable failure observations; retries are bounded and classified.
- **Funções puras e testes**: PASS — endpoint mapping and compact formatting are deterministic; tests never require network.
- **Segurança**: PASS — no credentials, persistence, or environment reads are introduced.
- **Fluxo e versionamento**: PASS — all design artifacts are under `specs/003-provider-status-tool`.

## Complexity Tracking

No constitution violations require justification.
