# Implementation Plan: Núcleo de raciocínio do OpsPilot

**Branch**: `001-reasoning-core` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

## Summary

Implementar um núcleo de raciocínio comparável para o OpsPilot, com um contrato comum de estratégia, eventos de trace tipados e métricas de execução. O estado operacional será carregado de `data/seed.json` em um store em memória determinístico, com ferramentas validadas por Zod. ReAct usará o agente pré-construído do LangGraph; Plan-and-Execute será um grafo explícito com planner, executor e replanner. A arena executará estratégias selecionadas sobre a mesma entrada e exibirá seus resultados.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `@langchain/core`, `@langchain/openai`, `@langchain/langgraph`, Zod, Express, Sequelize, MySQL, `tsx`

**Storage**: `data/seed.json` como fonte local; store em memória carregado do JSON para arena, tools e testes determinísticos

**Testing**: `node:test` via `tsx`, com testes unitários determinísticos sem rede; `npm run typecheck`

**Target Platform**: Node.js 22 LTS em ambiente de desenvolvimento/servidor

**Project Type**: Biblioteca de domínio e CLI de experimentação integrada a uma API Express

**Performance Goals**: Registrar latência em milissegundos e completar operações do store local de forma síncrona e determinística; limitar cada execução ao número de iterações configurado

**Constraints**: Temperatura do modelo igual a zero; máximo de oito passos no Plan-and-Execute; nenhuma credencial lida nos testes; nenhuma chamada de rede nos testes determinísticos; `git push` fora da aprovação automática

**Scale/Scope**: Cinco serviços, seis alertas no seed primário, três alertas `firing`, três `resolved`; duas estratégias na primeira versão; uma entrada compartilhada por execução da arena

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas MVC**: PASS — store/modelos, serviços de ferramentas e estratégias, e arena/borda CLI serão separados.
- **Validação na fronteira**: PASS — entradas das ferramentas e flags da arena serão validadas antes do uso.
- **Erros de domínio**: PASS — operações inválidas produzirão classes de erro traduzidas na borda da arena.
- **Funções puras**: PASS — formatação de trace, parsing de flags e operações determinísticas serão puros quando não exigirem estado.
- **Teste obrigatório**: PASS — store e formatação de trace terão testes determinísticos; typecheck e test serão executados.
- **Segurança**: PASS — configurações serão lidas apenas no factory de modelo; nenhum `.env` será lido diretamente; segredos não serão persistidos.
- **Spec antes de código**: PASS — esta implementação parte de `spec.md` versionada e aprovada.
- **Pequeno e reversível**: PASS — módulos independentes e tarefas ordenadas por dependência.

## Project Structure

### Documentation (this feature)

```text
specs/001-reasoning-core/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── reasoning-strategy.md
│   ├── tools.md
│   └── arena.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── model.ts
│   ├── types.ts
│   ├── trace.ts
│   ├── store.ts
│   ├── tools.ts
│   ├── react.ts
│   └── plan-and-execute.ts
├── arena.ts
└── index.ts

scripts/
└── seed.ts

src/agents/
├── store.test.ts
└── trace.test.ts
```

**Structure Decision**: Single Node.js/TypeScript project. O domínio operacional fica em `src/agents`, a arena permanece na raiz de `src` como CLI, e o seed executável fica em `scripts/`. Os testes permanecem próximos dos módulos determinísticos.

## Phase 0 — Research

1. Fixar o contrato de eventos e métricas para que ReAct e Plan-and-Execute produzam a mesma forma observável.
2. Definir o uso do modelo OpenRouter via `ChatOpenAI` com `configuration.baseURL`, temperatura zero e validação explícita das variáveis de ambiente.
3. Definir a integração das tools com o agente ReAct pré-construído do LangGraph e a captura de mensagens/tool calls no trace.
4. Definir o estado do grafo Plan-and-Execute, o limite de oito passos e a contagem de chamadas do modelo.
5. Separar o carregamento do JSON do store em memória para manter os testes sem rede.

## Phase 1 — Design

- Modelar entidades, estados e transições em `data-model.md`.
- Documentar os contratos públicos de estratégia, ferramentas e arena em `contracts/`.
- Documentar execução do seed, testes e arena em `quickstart.md`.

## Constitution Check — Post-Design

- **Camadas MVC**: PASS — o modelo de estado, os serviços de tools, as estratégias e a CLI permanecem separados.
- **Validação e erros**: PASS — schemas ficam nos contratos das tools e erros de domínio atravessam apenas a borda.
- **Funções puras e testes**: PASS — formatação, parsing e store determinístico podem ser testados sem rede.
- **Segurança**: PASS — o quickstart não exige credenciais para validação determinística e não orienta leitura direta de `.env`.
- **Fluxo e versionamento**: PASS — todos os artefatos ficam versionados em `specs/001-reasoning-core`.

## Complexity Tracking

Nenhuma violação da constituição requer justificativa adicional.
