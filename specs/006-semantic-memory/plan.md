# Implementation Plan: Memória semântica

**Branch**: `006-semantic-memory` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-semantic-memory/spec.md`

## Summary

Introduzir o boundary `MemoryStore` (`remember` / `recall` / `forget`) com
persistência SQLite da tabela `memories` (embedding em BLOB), embeddings locais
`all-MiniLM-L6-v2` via `@huggingface/transformers` (pooling mean, normalize
true) em lazy singleton, e extensão de `POST /chat` com `userId` opcional que
injeta o top-3 do recall no prompt composto — sem alterar a assinatura
`strategy.run(string)`. Teste obrigatório: recall encontra fato sem palavras em
comum. Produção injeta SQLite; testes usam `:memory:` (+ fake para HTTP sem
modelo, quando útil).

## Technical Context

**Language/Version**: TypeScript ESM strict, Node.js 22 LTS

**Primary Dependencies**: `node:sqlite`/`DatabaseSync`, Zod, Express,
`@huggingface/transformers`, `node:test`/`tsx`; LangChain/LangGraph
(estratégias inalteradas na assinatura pública)

**Storage**: SQLite via `OPSPILOT_DB` (default `./data/opspilot.db`);
`:memory:` nos testes do store; embedding `Float32` serializado em BLOB

**Testing**: `node:test` via `npm test`; contrato SQLite `:memory:` (+ fake
opcional); teste semântico com embeddings reais; HTTP com fake/stub;
`npm run typecheck`

**Target Platform**: Node.js 22 LTS (HTTP server e testes locais)

**Project Type**: Serviço HTTP de raciocínio operacional com stores injetáveis

**Performance Goals**: Recall top-3 com filtro ≥ 0.3; ranking em processo sobre
memórias do `userId` (escala local); singleton evita reload do modelo;
sem LLM/rede nos testes de store/HTTP (exceto download/cache inicial do modelo
no teste semântico)

**Constraints**: Prepared statements only; isolamento por `userId`; dedup >
0.92 no remember; top-3 / min 0.3 no recall; strategies não leem o memory
store; `remember` automático por turno fora do escopo v1

**Scale/Scope**: Uma tabela nova, boundary + SQLite (+ fake opcional), módulo
`src/memory/`, extensão Zod/`/chat` e composição de prompt, suíte de contrato
e HTTP

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Camadas explícitas**: PASS — embeddings/store em `src/memory/`, validação e
  composição HTTP em `src/http/`; strategies sem IO de memória.
- **Validação na fronteira**: PASS — `userId` opcional validado com Zod no body
  de `/chat`.
- **Erros de domínio**: PASS — fato vazio / falha de embed explícitos; forget
  inexistente fixado como no-op idempotente (ver research).
- **Funções puras**: PASS — produto escalar, ranking top-k e formatação do bloco
  de memória são funções puras; IO no store/embeddings.
- **Teste obrigatório**: PASS — `:memory:` + cenário semântico + HTTP stub.
- **Segurança**: PASS — prepared statements; sem segredos; sem ler `.env`.
- **Spec antes de código**: PASS — plano baseado em `006-semantic-memory`.
- **Pequeno e reversível**: PASS — `userId` opcional; clientes sem ele
  preservam comportamento atual.
- **Persistência local explícita**: PASS — mesmo padrão SQLite/`OPSPILOT_DB`/
  `:memory:`.
- **Reprodutibilidade**: PASS — contrato de store + teste semântico documentado.

## Project Structure

### Documentation (this feature)

```text
specs/006-semantic-memory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── memory-store.md
│   └── chat-http.md
└── tasks.md             # /speckit-tasks — não criado aqui
```

### Source Code (repository root)

```text
src/
├── memory/
│   ├── embeddings.ts              # lazy singleton pipeline + embed(text)
│   ├── embeddings.test.ts         # singleton + norma ~1 (pode ser leve)
│   ├── memory-store.ts            # interface MemoryStore + DomainError codes
│   ├── sqlite-memory-store.ts     # DDL memories + remember/recall/forget
│   ├── fake-memory-store.ts       # double para HTTP sem modelo (opcional)
│   ├── memory-ranking.ts          # dot product / top-k / dedup (puro)
│   ├── memory-prompt.ts           # formatação pura do bloco de fatos
│   └── memory-store.test.ts       # contrato :memory: + teste semântico
├── http/
│   ├── server.ts                  # Zod userId + composição recall
│   ├── chat-history.ts            # existente (histórico curto prazo)
│   └── server.test.ts             # injeta fatos no prompt via stub
└── index.ts                       # injeta SqliteMemoryStore + MemoryStore
```

**Structure Decision**: Seguir FR-006/FR-007 — `src/memory/` dedicado (não
fundir em `src/store/`), espelhando o estilo de `ConversationStore` mas com
boundary próprio. Colocalizar tabela `memories` no mesmo arquivo
`OPSPILOT_DB`. Composição de memória na borda HTTP (prefixo de texto),
combinada com histórico de conversa existente, antes de `strategy.run`.

## Phase 0 — Research

1. Escolher API exata de `@huggingface/transformers` (modelo Xenova, pooling,
   normalize) e padrão lazy singleton.
2. Definir serialização BLOB do vetor e ranking in-process vs SQL.
3. Definir assinaturas remember/recall/forget e comportamento de forget
   inexistente.
4. Definir ordem de composição prompt: memória + histórico + mensagem.
5. Definir estratégia de teste: real embeddings vs fake HTTP.

## Phase 1 — Design

- Modelar entidades e regras em `data-model.md`.
- Contratos em `contracts/memory-store.md` e `contracts/chat-http.md`.
- Validação determinística em `quickstart.md`.
- Reavaliar constitution check pós-design.

## Implementation Notes

- Constantes: `DEDUP_THRESHOLD = 0.92`, `RECALL_MIN_SCORE = 0.3`,
  `RECALL_TOP_K = 3`.
- Modelo: `Xenova/all-MiniLM-L6-v2` (ONNX local via Transformers.js).
- `remember` retorna `{ id, deduped: boolean }` ou o id existente em dedup —
  detalhe no contrato; efeito observável: sem nova linha se score > 0.92.
- Extender `composeStrategyInput` (ou helper adjacente) para aceitar fatos de
  memória opcionais sem quebrar callers de histórico.
- Métrica aditiva opcional `memoryFacts` (0–3) na composição — recomendada para
  observabilidade; se omitida na v1, testes HTTP afirmam o texto composto via
  stub. Preferir incluir `metrics.memoryFacts` por simetria com
  `historyMessages`.
- Reutilizar `DomainError` do padrão de stores existentes quando fizer sentido;
  evitar classes duplicadas sem ganho.

## Constitution Check — Post-Design

- **Camadas**: PASS — `src/memory/` + HTTP; strategies intactas.
- **Validação + erros**: PASS — Zod `userId`; fato vazio rejeitado; forget
  no-op.
- **Persistência segura**: PASS — DDL idempotente + prepared statements + BLOB.
- **Testes**: PASS — `:memory:` + semântico real + HTTP stub/fake.
- **Reversibilidade**: PASS — sem `userId` = caminho legado preservado.

## Complexity Tracking

Nenhuma violação constitucional requer justificativa.
