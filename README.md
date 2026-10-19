# OpsPilot

[![Deploy](https://github.com/rafaeldutra/criacao-agentes-autonomos-ops-pilot/actions/workflows/deploy.yml/badge.svg)](https://github.com/rafaeldutra/criacao-agentes-autonomos-ops-pilot/actions/workflows/deploy.yml)

O OpsPilot é um copiloto de plantão para alertas e incidentes de produção. A API é um agente LangChain/LangGraph sobre OpenRouter que lista alertas e incidentes, consulta runbooks, verifica o status de provedores externos e abre ou resolve incidentes. Pela API HTTP, ações sensíveis (`resolve_incident` e `forget_preference`) só executam depois de **aprovação humana**.

## War Room

A interface web fica publicada em **https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/**. Nela é possível conversar com o agente, ver o raciocínio de cada resposta e aprovar ou negar ações. Por padrão, a página aponta para uma API em `http://localhost:3000`, e o endereço pode ser trocado na engrenagem.

Detalhes de configuração, publicação no GitHub Pages e hospedagem própria: [`web/README.md`](web/README.md).

## Stack

- **API**: Node.js 22 LTS, TypeScript ESM strict, Express, Zod, SQLite nativo (`node:sqlite`) e LangChain/LangGraph sobre OpenRouter.
- **War Room** (`web/`): Vite, React e TypeScript strict, com Zod nas respostas da API, CSS Modules com tokens de design e Vitest com Testing Library e axe-core.

## Comandos

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | API HTTP em `http://localhost:3000` |
| `npm run seed` | carrega o cenário Mercadinho (idempotente) |
| `npm run mcp` | servidor MCP (stdio) com as ferramentas de operação |
| `npm run arena` / `npm run bench` | compara estratégias de raciocínio |
| `npm run test` / `npm run typecheck` | testes (`node:test`) e tipos da API |
| `npm run web:dev` | War Room em `http://localhost:5173/opspilot/` |
| `npm run web:test` / `npm run web:typecheck` | testes e tipos da War Room |
| `npm run web:build` | build da War Room em `web/dist/` |

## Configuração

As variáveis da API estão documentadas em [`.env.example`](.env.example): modelo e chave do OpenRouter, orçamentos de contexto, preços, `OPSPILOT_CORS_ORIGINS` e `OPSPILOT_APPROVAL_TTL_MINUTES`. Copie o arquivo para `.env` localmente e **nunca** faça commit do `.env`.

Para que a War Room publicada converse com a sua API, inclua `https://rafaeldutra.github.io` em `OPSPILOT_CORS_ORIGINS`.

## Fluxo de desenvolvimento

Toda mudança segue o Spec Kit, nesta ordem:

`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`

As specs ficam versionadas em [`specs/`](specs/), e os princípios do projeto estão na [constituição](.specify/memory/constitution.md). As regras de design da interface estão em [`.github/instructions/design.instructions.md`](.github/instructions/design.instructions.md).
