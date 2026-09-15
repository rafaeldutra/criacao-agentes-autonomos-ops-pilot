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

### IX. Persistência local explícita

A persistência operacional oficial usa SQLite via `node:sqlite` e `DatabaseSync`.
O caminho de produção é configurado por `OPSPILOT_DB`, com default
`./data/opspilot.db`; testes usam `:memory:`. O schema é criado de forma
idempotente, consultas usam prepared statements e nenhum SQL pode ser
montado por concatenação de entrada.

### X. Reprodutibilidade de cenários

O seed do cenário Mercadinho é idempotente e deve produzir o mesmo estado
inicial em SQLite e nos doubles em memória. O store em memória permanece
permitido somente para testes determinísticos e benchmark, enquanto a
composição da aplicação injeta explicitamente o store escolhido.

## Stack obrigatória

Node.js 22 LTS, TypeScript ESM strict, Zod, `node:test` via `tsx`, Express,
SQLite nativo por `node:sqlite`/`DatabaseSync` e LangChain/LangGraph sobre
OpenRouter. Sequelize/MySQL não são dependências de persistência operacional.

## Comandos oficiais

- `npm run dev` — executa `tsx src/index.ts`.
- `npm run arena` — executa `tsx src/arena.ts`.
- `npm run bench` — executa `tsx src/bench.ts`.
- `npm run test` — executa `node --import tsx --test "src/**/*.test.ts"`.
- `npm run typecheck` — executa `tsc --noEmit`.

## Governance

Esta constituição orienta specs, planos, tarefas e implementações do OpsPilot. Alterações devem ser documentadas, revisadas e versionadas junto com o projeto.

**Version**: 1.1.0 | **Ratified**: 2026-09-08 | **Last Amended**: 2026-09-15
