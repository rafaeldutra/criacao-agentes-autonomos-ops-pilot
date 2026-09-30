# Research: Sumarização de histórico (pruning)

## Decision: Extender `ConversationStore` com resumo (mesma DB)

**Decision**: Adicionar à interface `ConversationStore`:

- `getSummary(conversationId): ConversationSummaryRecord | undefined`
- `upsertSummary(conversationId, summary: string, coveredCount: number): void`
- `messageCount(conversationId): number`
- `messagesAscending(conversationId, offset, limit): ConversationMessage[]`

DDL em `SqliteConversationStore`:

```sql
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
  summary TEXT NOT NULL,
  covered_count INTEGER NOT NULL CHECK (covered_count >= 0),
  updated_at TEXT NOT NULL
);
```

**Rationale**: Um resumo por conversa; FK evita órfãos; fake e SQLite
permanecem substitutos; alinhado à constituição de persistência local.

**Alternatives considered**: Store separado só de summaries — rejeitado
(duplica `exists`/erros). Coluna em `conversations` — rejeitado (menos
claro para evolução e testes de tabela pedida).

## Decision: Janela raw = 8; `HISTORY_WINDOW` no `/chat` muda de 12 → 8

**Decision**: Constante `HISTORY_WINDOW` (usada por `runChat` /
`formatHistoryOnly`) passa a **8**. Testes 005 que afirmam 12 no HTTP devem
ser atualizados para 8 (ou assertar `HISTORY_WINDOW`).

**Rationale**: Spec FR-002 / Assumptions — pruning + resumo cobrem o papel
do histórico antigo.

**Alternatives considered**: Manter 12 e sumarizar só o excedente além de 8 —
rejeitado (contradiz o pedido de “8 mensagens recentes”).

## Decision: Elegibilidade de lote (ponteiro `covered_count`)

**Decision**: Mensagens ordenadas oldest→newest, índices `0 .. n-1`.

- Janela raw: últimas `HISTORY_WINDOW` (8) → índices `max(0, n-8) .. n-1`
- Fora da janela: `0 .. n-9` quando `n > 8`
- Já cobertas: `0 .. covered_count-1`
- Descobertas fora da janela: de `covered_count` até `n-8-1` (exclusive end)
- Lote pronto quando ` (n - 8) - covered_count >= 8 `
- Batch = `messagesAscending(id, covered_count, 8)` (exatamente 8)
- Após persistir: `covered_count += 8`

Função pura `selectSummaryBatch({ total, coveredCount, windowSize: 8 })` →
`{ offset, limit: 8 } | undefined`.

**Rationale**: Testável sem IO; “nunca a cada request”; excedentes (7, 9, 15)
só disparam em múltiplos de 8 descobertos.

**Alternatives considered**: Sumarizar tudo fora da janela a cada turno —
rejeitado (FR-005). Trigger por tokens — fora de escopo.

## Decision: Timing — compose com resumo atual; summarize após o turno

**Decision** (ordem em `runChat`):

1. Resolver conversa; `history = lastMessages(8)` (**antes** dos appends do turno).
2. `record = getSummary(...)`; `summaryText = record?.summary ?? ""`.
3. Compor: `formatSummaryBlock(summaryText) + memory + history+message`.
4. Append user → `strategy.run` → append assistant.
5. Recalcular elegibilidade com `messageCount` **após** os dois appends.
6. Se lote pronto: `summarizer(prev, batch)` → `upsertSummary` → anexar
   `{ type: "summarize", content }` ao `trace` do resultado.
7. Se summarizer/upsert falhar: `console.error` (ou `onError`); **não** 5xx;
   ponteiro inalterado; sem evento `summarize`.

O resumo **recém** gerado alimenta o **próximo** turno (não recompõe o input
já enviado à strategy neste turno).

**Rationale**: Mantém `historyMessages` = raw pré-append (0..8); permite
evento no mesmo response; evita 5xx; alinhado ao espírito fire-and-observe
do learning (007), mas sync o bastante para o trace.

**Alternatives considered**: Summarize antes do `run` neste turno — possível
mas atrasa TTFT e mistura falha LLM no caminho crítico antes da resposta.
Async pós-`json()` — não consegue colocar evento no trace do mesmo 200.

## Decision: Porta `HistorySummarizer` + fake

**Decision**:

```ts
type HistorySummarizer = (input: {
  previousSummary: string;
  batch: readonly ConversationMessage[];
}) => Promise<string>;
```

Default: LLM + system prompt (decisões/fatos/pendências, ~150 tokens, sem
segredos). Fake de teste: concatena marcadores determinísticos e conta
chamadas.

**Rationale**: FR-008 / SC-007; espelha padrão do learning reflector.

**Alternatives considered**: Heurística sem LLM — rejeitado (pedido implica
summarizer de conteúdo). Sempre LLM real no CI — rejeitado.

## Decision: `contextBreakdown.summary` (008)

**Decision**: Estender `ContextBreakdown` / `buildContextBreakdown` com
campo opcional ou obrigatório `summary` estimado via `estimateTokens` do
bloco de resumo (0 se vazio). Chaves existentes permanecem.

**Rationale**: Spec US4 aceita extensão; fecha observabilidade com 008.

**Alternatives considered**: Só no composed string sem breakdown — aceitável
mínimo, mas breakdown é barato e consistente.

## Decision: Módulo em `src/conversation/`

**Decision**: Colocar summarizer, batch puro e `formatSummaryBlock` em
`src/conversation/` (novo), deixando `src/store/` só persistência e
`src/http/` só composição.

**Rationale**: Domínio de conversa/resumo distinto de memória semântica
(006) e de ops store.

**Alternatives considered**: Tudo em `src/http/` — rejeitado (dificulta
teste puro). Em `src/memory/` — rejeitado (colide semanticamente com 006/007).
