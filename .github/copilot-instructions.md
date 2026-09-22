# OpsPilot

OpsPilot é um copiloto de plantão que gerencia alertas e incidentes de produção. A API é um agente LangChain/LangGraph sobre OpenRouter.

## Stack

- Node.js 22 LTS.
- TypeScript ESM strict.
- Zod na fronteira HTTP/CLI.
- Testes com `node:test` via `tsx`.
- Express com MySQL como banco.

## Comandos

- `npm run dev` — executa `tsx src/index.ts`.
- `npm run arena` — executa `tsx src/arena.ts`.
- `npm run bench` — executa `tsx src/bench.ts`.
- `npm run test` — executa os testes com `node --import tsx --test "src/**/*.test.ts"`.
- `npm run typecheck` — executa `tsc --noEmit`.

## Convenções

- Use as camadas MVC: Model, Service e Controller.
- Valide entradas externas com Zod.
- Traduza erros de domínio, definidos como classes, na borda HTTP/CLI.
- Toda lógica nova deve nascer com teste.
- Mantenha `npm run typecheck` e `npm run test` verdes.
- Nunca commite segredos nem leia `.env`.
- Sempre utilize funções puras.

## Fluxo

Siga o Spec Kit (integração Cursor em `.cursor/skills/`) em quatro etapas obrigatórias e em ordem:

`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`

1. `/speckit-specify` — escreve ou atualiza a spec da feature, em Markdown versionado em `specs/`.
2. `/speckit-plan` — gera o plano de design e as decisões técnicas a partir da spec.
3. `/speckit-tasks` — decompõe o plano em tarefas ordenadas por dependência.
4. `/speckit-implement` — executa as tarefas; código, testes e typecheck devem permanecer verdes, e então cria o commit.

Specs são artefatos de primeira classe: devem ser criadas, revisadas e versionadas junto com o código. Nenhuma implementação começa sem uma spec aprovada.
