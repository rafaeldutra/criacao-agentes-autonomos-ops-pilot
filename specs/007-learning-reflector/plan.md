# Implementation Plan: Refletor de aprendizado

**Branch**: `007-learning-reflector` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-learning-reflector/spec.md`

## Summary

Após cada resposta bem-sucedida de `/chat` com `userId`, um **LearningReflector**
(`withStructuredOutput` + Zod `{ hasLearning, fact }`) analisa a última mensagem
do usuário, destila apenas fatos duráveis (nunca pedido pontual, nunca segredo) e
dispara `memories.remember` de forma **assíncrona** (não bloqueia a resposta).
Adiciona a tool `forget_preference` (recall semântico → `forget(id)`) com
`userId` injetado por contexto de request. Depende de `006-semantic-memory`.
Distinto da reflection crítica (002).

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: Zod, LangChain (`withStructuredOutput`), Express,
`MemoryStore` (006), `node:test`/`tsx`; OpenRouter via `createOpenRouterModel`

**Storage**: Reutiliza `MemoryStore` / tabela `memories` (006); sem schema novo

**Testing**: `node:test`; reflector e HTTP com stub de structured output;
`forget_preference` com `FakeMemoryStore`; sem LLM real obrigatório no CI

**Target Platform**: Node.js 22 LTS (HTTP server e testes locais)

**Project Type**: Serviço HTTP de raciocínio operacional com stores/tools
injetáveis

**Performance Goals**: Caminho crítico do chat não aguarda `remember` nem o
LLM do reflector além do necessário para *agendar* o trabalho; aprendizado
pós-resposta; falhas isoladas

**Constraints**: Só aprende com `userId`; fire-and-forget seguro; tools sem
acoplar strategies ao store além da tool; não misturar com crítico 002;
prepared statements via store existente

**Scale/Scope**: Um módulo reflector + helper de schedule, uma tool nova,
composição HTTP/`createTools`/`createAgentRegistry`, métrica/log mínimos

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — reflector/schedule em `src/memory/` (ou
  helper HTTP), tools em `src/agents/tools.ts`, composição em `src/http/`;
  strategies sem `remember` direto.
- **Validação na fronteira**: PASS — schema Zod do veredito; tool schema Zod;
  `userId` já validado em `/chat`.
- **Erros de domínio**: PASS — tool sem `userId` / sem match devolve mensagem
  clara; falhas async não viram 5xx do chat.
- **Funções puras**: PASS — validação `shouldRemember(verdict)` e montagem de
  prompt podem ser puras; IO no store/LLM.
- **Teste obrigatório**: PASS — stubs cobrem SC-001–SC-007 sem LLM real.
- **Segurança**: PASS — prompt proíbe segredos; sem ler `.env`; forget só no
  `userId` do contexto.
- **Spec antes de código**: PASS — plano baseado em `007-learning-reflector`.
- **Pequeno e reversível**: PASS — aditivo; sem `userId` = caminho legado.
- **Persistência local explícita**: PASS — reutiliza `MemoryStore` 006.
- **Reprodutibilidade**: PASS — doubles injetáveis para reflector e store.

## Project Structure

### Documentation (this feature)

```text
specs/007-learning-reflector/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── learning-reflector.md
│   ├── forget-preference-tool.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/
├── memory/
│   ├── learning-reflector.ts      # schema, prompt, createLearningReflector, scheduleLearning
│   ├── learning-reflector.test.ts
│   ├── memory-store.ts            # existente (006)
│   └── ...
├── agents/
│   ├── tools.ts                   # + forget_preference (+ opções MemoryStore/getUserId)
│   ├── tools.test.ts              # cobertura forget_preference
│   ├── index.ts                   # registry recebe memories + request context hook
│   └── ...
├── http/
│   ├── server.ts                  # pós-resposta: scheduleLearning; set userId context
│   ├── request-context.ts         # get/set userId do turno (ALS ou ref injetável)
│   └── server.test.ts
└── index.ts                       # wire reflector default + memories no registry
```

**Structure Decision**: Colocar o reflector ao lado da memória (`src/memory/`)
porque o output é `remember`. Contexto de `userId` por request via helper
pequeno (`request-context` ou callback `getUserId` nas tools) para
`forget_preference` sem passar `userId` no schema da tool (evita spoofing).
Composição HTTP agenda o aprendizado **depois** de montar o resultado do
turno (e idealmente após `res.json`, ou ao menos sem `await remember`).

## Phase 0 — Research

1. Onde encaixar o reflector vs reflection 002.
2. Como injetar `userId` na tool sem schema inseguro.
3. Semântica exata de fire-and-forget + observabilidade.
4. Matching de `forget_preference` (recall top-1 + limiar).
5. Contrato de testes com stub de structured output.

## Phase 1 — Design

- Modelar entidades em `data-model.md`.
- Contratos reflector, tool e extensão HTTP.
- `quickstart.md` de validação.
- Reavaliar constitution check pós-design.

## Implementation Notes

- Schema: `z.object({ hasLearning: z.boolean(), fact: z.string() })` com refine:
  se `hasLearning` então `fact.trim().min(1)`.
- Prompt: fatos duráveis em forma estável; excluir one-shot e segredos.
- `scheduleLearning({ userId, userMessage, memories, reflect })`:
  `void (async () => { ... })().catch(log)`.
- Métrica aditiva opcional: `learningQueued: boolean` (true se reflector
  agendado com `userId`); falhas só em log (`console.error` ou logger mínimo).
- `forget_preference` schema: `{ preference: z.string().trim().min(1) }`;
  `recall(userId, preference)` → se top score ≥ 0.3, `forget(id)`; senão
  mensagem “nothing forgotten”.
- Estender `createTools(opsStore, { memories, getUserId, fetch? })`.
- Registry: passar `memories` e `getUserId` desde `createApp`/`index`.

## Constitution Check — Post-Design

- **Camadas**: PASS — memory reflector + tools + HTTP composition.
- **Validação + erros**: PASS — Zod veredito/tool; mensagens claras.
- **Segurança**: PASS — sem `userId` no input da tool; prompt anti-segredo.
- **Testes**: PASS — stubs sem LLM/rede obrigatórios.
- **Reversibilidade**: PASS — feature opt-in via `userId`.

## Complexity Tracking

Nenhuma violação constitucional requer justificativa.
