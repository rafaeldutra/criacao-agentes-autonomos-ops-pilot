# Implementation Plan: OpsPilot MCP Server

**Branch**: `004-mcp-server` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-mcp-server/spec.md`

## Summary

Adicionar um servidor MCP local do OpsPilot sobre transporte stdio, identificado como
`opspilot`, expondo somente as três tools operacionais existentes. A integração usará
o SDK oficial MCP, compartilhará os schemas Zod e o mesmo `OpsStore` da camada de
tools, e manterá stdout reservado às mensagens do protocolo.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `@modelcontextprotocol/sdk`, `@langchain/core`, Zod, `tsx`, `node:test`

**Storage**: Existing injected `OpsStore`; default composition reuses the current seeded store

**Testing**: `node:test` via `tsx`, in-process MCP client/server transport tests, `npm run typecheck`

**Target Platform**: Node.js process launched by an MCP client over stdio

**Project Type**: CLI-style protocol server and agent integration adapter

**Performance Goals**: Complete initialization and tool discovery without unrelated stdout output; tool calls remain bounded by existing store operations

**Constraints**: stdio is protocol-only; no `console.log` in MCP code; exactly three tools; shared schemas and store; no secrets or `.env` reads required

**Scale/Scope**: One server entry point, one package script, three registered tools, deterministic protocol tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — MCP adapter is an integration/controller boundary and delegates operations to existing tools/store.
- **Validação na fronteira**: PASS — MCP tool inputs reuse the existing Zod schemas.
- **Erros de domínio**: PASS — existing tool/store errors remain translated by the MCP adapter into protocol tool errors.
- **Funções puras**: PASS — tool registry and schema mapping are deterministic; no duplicate domain logic.
- **Teste obrigatório**: PASS — protocol discovery, calls, invalid inputs, store mutation, and stdout isolation are covered.
- **Segurança**: PASS — no credentials, `.env` reads, or protocol data on stdout outside MCP messages.
- **Spec antes de código**: PASS — this plan follows the approved feature spec.
- **Pequeno e reversível**: PASS — additive server entry point and script; existing CLI/agent tools remain unchanged.

## Project Structure

### Documentation

```text
specs/004-mcp-server/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-server.md
└── tasks.md
```

### Source Code

```text
src/
├── agents/
│   ├── tools.ts
│   └── tools.test.ts
└── mcp/
    ├── server.ts
    └── server.test.ts
```

**Structure Decision**: Keep the MCP adapter in `src/mcp/` and reuse the public
schemas and `createTools` composition from `src/agents/tools.ts`. The adapter
must not introduce a second store, duplicate input schemas, or duplicate
incident mutation logic. The package script points directly to `src/mcp/server.ts`.

## Phase 0 — Research

1. Confirm the official MCP TypeScript SDK server and stdio APIs compatible with the project runtime.
2. Define how existing Zod schemas are passed to MCP tool registration without duplicating contracts.
3. Define an in-process transport test strategy for initialization, discovery, calls, and stdout isolation.
4. Define protocol error handling for invalid inputs and store/domain failures.

## Phase 1 — Design

- Model the server identity, exposed tools, shared store, and tool-call results in `data-model.md`.
- Document launch, discovery, tool-call, and stdout/stderr contracts in `contracts/mcp-server.md`.
- Document deterministic typecheck, test, and local launch validation in `quickstart.md`.

## Constitution Check — Post-Design

- **Camadas e fronteira**: PASS — MCP registration stays in `src/mcp/server.ts`; operational behavior remains in existing tools/store.
- **Validação e erros**: PASS — existing Zod schemas are reused and failures become MCP tool errors without silent mutation.
- **Funções puras e testes**: PASS — registration is deterministic and protocol tests use an in-process transport.
- **Segurança**: PASS — stdout is protocol-only; diagnostics use stderr and no environment secrets are required.
- **Fluxo e versionamento**: PASS — all design artifacts are under `specs/004-mcp-server`.

## Complexity Tracking

No constitution violations require justification.
