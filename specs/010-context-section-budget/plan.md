# Implementation Plan: ContextBuilder com orçamento por seção

**Branch**: `010-context-section-budget` | **Date**: 2026-10-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-context-section-budget/spec.md`

## Summary

Introduzir `src/context/context-builder.ts` como fonte única de composição do
prompt do `/chat` para todas as estratégias. Cada seção orçável
(resumo / janela / memórias) tem teto em tokens estimados (`floor(chars/4)`),
configurável via `CONTEXT_BUDGET_*` (defaults 200 / 1200 / 300). System e
mensagem atual são intocáveis. Janela corta mensagens mais antigas; memórias
cortam menor score; resumo trunca pelo final. Testes com tetos baixos fixam a
ordem de corte. `contextBreakdown` passa a refletir o texto **já orçado**.

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: Express, Zod, `node:test`/`tsx`; reutiliza
`estimateTokens` / `buildContextBreakdown` (008), `formatSummaryBlock` (009),
`formatMemoryBlock` (006), `HISTORY_WINDOW` / histórico (005/009)

**Storage**: N/A — sem schema novo; só composição em memória no turno

**Testing**: `node:test`; testes unitários do builder com fixtures
determinísticas (mensagens ordenadas + fatos com scores); ajuste dos testes
HTTP existentes que assertam `contextBreakdown` / input da strategy

**Target Platform**: Node.js 22 LTS (HTTP local)

**Project Type**: Serviço HTTP de raciocínio operacional

**Performance Goals**: Corte é O(n) sobre janela ≤ 8 e top-k de memórias;
sem LLM extra; puro e síncrono no caminho de compose

**Constraints**: System + mensagem atual nunca truncados; mensagem mais recente
da janela permanece mesmo se sozinha > teto; env inválido → default; seções
vazias omitidas; breakdown pós-corte

**Scale/Scope**: 1 módulo novo + wire no `runChatTurn` / `server.ts`; docs de
env; sem mudança de contrato HTTP além do conteúdo efetivo do prompt (aditivo
em observabilidade se breakdown já existir)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — builder em `src/context/`; HTTP só orquestra
  recall/store e chama o builder; strategies continuam recebendo `string`.
- **Validação na fronteira**: PASS — body `/chat` inalterado (Zod existente);
  budgets validados na leitura de env (número finito ≥ 0 ou default).
- **Erros de domínio**: PASS — sem novos erros de domínio; compose não falha
  por orçamento.
- **Funções puras**: PASS — `buildContext` e helpers de corte puros; budgets
  injetáveis (env lido na borda/composição).
- **Teste obrigatório**: PASS — SC-001–SC-006 cobertos por testes do builder;
  HTTP usa o mesmo caminho.
- **Segurança**: PASS — sem segredos novos; documentar `CONTEXT_BUDGET_*` em
  `.env.example` sem ler `.env` no código de teste de forma proibida.
- **Spec antes de código**: PASS — plano baseado em `010-context-section-budget`.
- **Pequeno e reversível**: PASS — substitui concatenação ad-hoc; comportamento
  abaixo dos tetos ≈ status quo.
- **Persistência local explícita**: PASS — N/A (sem DDL).
- **Reprodutibilidade**: PASS — fixtures determinísticas; budgets injetados
  nos testes (não dependem do ambiente do CI).

*Post-design re-check*: PASS — contratos/data-model alinhados; sem novas
camadas injustificadas.

## Project Structure

### Documentation (this feature)

```text
specs/010-context-section-budget/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── context-builder.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts                 # reutiliza estimateTokens / buildContextBreakdown
│   ├── context-builder.ts        # NOVO: buildContext + loadSectionBudgets + cuts
│   └── context-builder.test.ts   # NOVO: tetos baixos / ordem de corte
├── http/
│   ├── chat-history.ts           # formatHistoryOnly / compose — podem ser
│   │                             # reutilizados pelo builder ou encapsulados
│   ├── server.ts                 # runChatTurn: usa buildContext; breakdown pós-corte
│   └── server.test.ts            # asserts com budgets injetados se necessário
├── conversation/
│   └── summary-prompt.ts         # formatSummaryBlock (inalterado ou chamado pós-trim)
├── memory/
│   └── memory-prompt.ts          # formatMemoryBlock (após drop por score)
└── .env.example                  # + CONTEXT_BUDGET_SUMMARY/WINDOW/MEMORIES
```

**Structure Decision**: Módulo puro em `src/context/context-builder.ts` como
único compose do prompt do `/chat`. Formatação de blocos existentes
(summary/memory/history) permanece nos módulos atuais; o builder aplica corte
**antes** de formatar (ou no texto do resumo) e monta a string final na ordem
`system → summary → memories → window → current message`. Budgets injetados
como `SectionBudget`; `loadSectionBudgets(env)` na composição da app.

## Complexity Tracking

> Sem violações de constituição a justificar.
