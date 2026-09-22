# Implementation Plan: Conversa persistente

**Branch**: `005-persistent-conversation` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-persistent-conversation/spec.md`

## Summary

Introduzir um boundary `ConversationStore` (`create` / `append` / `lastMessages`)
com implementação SQLite no estilo de `SqliteOpsStore` (tabelas `conversations` e
`messages`) e um fake em memória para testes. O endpoint `POST /chat` passa a
aceitar `conversationId` opcional, sempre devolvê-lo na resposta, carregar até
12 mensagens anteriores via composição (sem acoplar estratégias ao store) e
reportar `metrics.historyMessages`. Produção injeta o store SQLite; testes usam
`:memory:` e o fake.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `node:sqlite`/`DatabaseSync`, Zod, Express,
`node:test`/`tsx`, LangChain/LangGraph (estratégias existentes inalteradas na
assinatura pública)

**Storage**: SQLite via `OPSPILOT_DB` (default `./data/opspilot.db`);
`:memory:` e fake in-memory nos testes

**Testing**: `node:test` via `npm test`; contrato compartilhado fake + SQLite
`:memory:`; testes HTTP com store fake e estratégia stub; `npm run typecheck`

**Target Platform**: Node.js 22 LTS (HTTP server e testes locais)

**Project Type**: Serviço HTTP de raciocínio operacional com stores injetáveis

**Performance Goals**: `lastMessages` limitado a 12; prepared statements;
sem dependência de rede/LLM nos testes de store e composição

**Constraints**: Sem concatenação SQL com entrada; papéis fechados
`user` | `assistant`; janela fixa de 12; strategies não leem o store
diretamente; apenas mensagem do usuário + resposta final são persistidas por
turno

**Scale/Scope**: Duas tabelas novas, um boundary + duas implementações, extensão
de `/chat` e `Metrics`, suíte de contrato e HTTP

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — persistência em `src/store/`, validação e HTTP em
  `src/http/`, composição injeta o store; strategies permanecem sem IO de
  conversa.
- **Validação na fronteira**: PASS — `conversationId` opcional validado com Zod
  no body de `/chat`.
- **Erros de domínio**: PASS — conversa desconhecida vira erro de domínio
  traduzido na borda HTTP.
- **Funções puras**: PASS — formatação da janela de histórico e merge de
  métricas são funções puras; IO fica no store.
- **Teste obrigatório**: PASS — fake + `:memory:` + HTTP cobrem o contrato.
- **Segurança**: PASS — prepared statements; sem segredos; sem ler `.env`.
- **Spec antes de código**: PASS — plano baseado em `005-persistent-conversation`.
- **Pequeno e reversível**: PASS — campos aditivos em resposta/métricas; clients
  sem `conversationId` continuam válidos.
- **Persistência local explícita**: PASS — mesmo padrão SQLite/`OPSPILOT_DB`/
  `:memory:`.
- **Reprodutibilidade**: PASS — fake e SQLite compartilham o mesmo contrato de
  testes.

## Project Structure

### Documentation (this feature)

```text
specs/005-persistent-conversation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── conversation-store.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── conversation-store.ts          # interface + DomainError codes
│   ├── sqlite-conversation-store.ts   # DDL + create/append/lastMessages
│   ├── fake-conversation-store.ts     # double em memória
│   ├── conversation-store.test.ts     # contrato fake + :memory:
│   ├── ops-store.ts                   # existente
│   └── sqlite-ops-store.ts            # existente
├── agents/
│   ├── types.ts                       # Metrics.historyMessages
│   ├── strategy.ts                    # helpers de métricas se necessário
│   └── ...                            # strategies sem dependência do store
├── http/
│   ├── server.ts                      # /chat + composição de histórico
│   ├── chat-history.ts                # formatação pura da janela (opcional)
│   └── server.test.ts
└── index.ts                           # injeta SqliteConversationStore
```

**Structure Decision**: Manter `ConversationStore` separado de `OpsStore`
(fronteiras distintas). Colocar implementações em `src/store/` ao lado de
`SqliteOpsStore`. A composição de histórico vive na borda HTTP (ou helper puro
em `src/http/`), não dentro de ReAct/Plan-and-Execute. Reutilizar o mesmo
caminho `OPSPILOT_DB` com uma conexão `DatabaseSync` própria do conversation
store (tabelas adicionais no mesmo arquivo em produção).

## Phase 0 — Research

1. Decidir se o histórico enriquece `ReasoningInput` ou apenas o texto composto
   passado a `strategy.run`.
2. Definir schema `conversations` + `messages`, ids e ordenação de
   `lastMessages`.
3. Definir mapeamento de erro de conversa desconhecida para HTTP.
4. Definir contrato de teste compartilhado fake vs `:memory:`.
5. Definir ownership de `close()` junto com o ops store no shutdown.

## Phase 1 — Design

- Modelar entidades e regras em `data-model.md`.
- Contratos em `contracts/conversation-store.md` e `contracts/chat-http.md`.
- Validação determinística em `quickstart.md`.
- Reavaliar constitution check pós-design.

## Implementation Notes

- Constante `HISTORY_WINDOW = 12` na composição HTTP.
- Por turno: `append(user)` antes ou após o run conforme atomicidade desejada;
  preferir append do user após validar conversa e antes do run; append do
  assistant após sucesso; falha no append pós-resposta deve propagar erro
  explícito (cliente não recebe 200 enganoso).
- Formatar histórico como bloco de texto puro prepended à mensagem atual para
  não alterar a interface `ReasoningStrategy.run(string)`.
- Estender `Metrics` com `historyMessages: number` (obrigatório na resposta de
  `/chat`; strategies base podem continuar emitindo só `llmCalls`/`latencyMs`
  e a composição completa o campo).
- Reutilizar `DomainError` existente em `ops-store.ts` ou extrair shared error
  type se necessário — evitar duplicar classes sem ganho.

## Constitution Check — Post-Design

- **Camadas**: PASS — store / HTTP / strategies separados; composição injeta.
- **Validação + erros**: PASS — Zod na borda; `CONVERSATION_NOT_FOUND` no domínio.
- **Persistência segura**: PASS — DDL idempotente + prepared statements.
- **Testes**: PASS — fake + `:memory:` + HTTP stubs sem LLM/rede.
- **Reversibilidade**: PASS — comportamento legado preservado com campos aditivos.

## Complexity Tracking

Nenhuma violação constitucional requer justificativa.
