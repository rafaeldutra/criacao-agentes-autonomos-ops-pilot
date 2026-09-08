# OpsPilot Constitution

Princípios não-negociáveis que toda spec, plano, tarefa e código seguem.

## Core Principles

### I. Camadas explícitas

A aplicação usa MVC: Model, Service e Controller. Dependências fluem da borda HTTP/CLI para os serviços e modelos; o domínio não faz IO desnecessário.

### II. Validação na fronteira

Toda entrada externa HTTP/CLI é validada com Zod antes de virar domínio.

### III. Erros são de domínio

Falhas previsíveis são representadas por classes de erro e traduzidas em respostas HTTP ou saídas CLI na borda.

### IV. Funções puras por padrão

A lógica de negócio deve ser implementada com funções puras sempre que possível.

### V. Teste é parte da tarefa

Toda lógica nova nasce com teste. `npm run typecheck` e `npm run test` devem permanecer verdes.

### VI. Segurança por padrão

Nunca commitar segredos nem ler `.env`. Ações destrutivas seguem a allow/deny list configurada para o agente; `git push` exige aprovação manual.

### VII. Spec antes de código

Mudanças seguem obrigatoriamente `speckit.specify` → `speckit.plan` → `speckit.tasks` → `speckit.implement`. Specs são criadas, revisadas e versionadas em `specs/`; nenhuma implementação começa sem spec aprovada.

### VIII. Pequeno e reversível

Tarefas devem ser ordenadas por dependência, manter escopo claro e preservar o comportamento existente.

## Stack obrigatória

Node.js 22 LTS, TypeScript ESM strict, Zod, `node:test` via `tsx`, Express, Sequelize com MySQL e LangChain/LangGraph sobre OpenRouter.

## Comandos oficiais

- `npm run dev` — executa `tsx src/index.ts`.
- `npm run arena` — executa `tsx src/arena.ts`.
- `npm run bench` — executa `tsx src/bench.ts`.
- `npm run test` — executa `node --import tsx --test "src/**/*.test.ts"`.
- `npm run typecheck` — executa `tsc --noEmit`.

## Governance

Esta constituição orienta specs, planos, tarefas e implementações do OpsPilot. Alterações devem ser documentadas, revisadas e versionadas junto com o projeto.

**Version**: 1.0.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-09-08
