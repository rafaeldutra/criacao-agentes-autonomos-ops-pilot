# Contract: History summarizer + batch

## Constants

- `HISTORY_WINDOW = 8` (raw messages no `/chat`)
- `SUMMARY_BATCH_SIZE = 8`

## `selectSummaryBatch` (puro)

```ts
selectSummaryBatch(input: {
  totalMessages: number;
  coveredCount: number;
  windowSize?: number; // default 8
  batchSize?: number;  // default 8
}): { offset: number; limit: number } | undefined
```

Retorna `{ offset: coveredCount, limit: 8 }` somente se
`(totalMessages - windowSize - coveredCount) >= batchSize`.

## `formatSummaryBlock`

```ts
formatSummaryBlock(summary: string): string
```

- vazio/whitespace → `""`
- senão → bloco explícito (ex. `[Conversation summary]\n...\n\n`)

## `HistorySummarizer`

```ts
type HistorySummarizer = (input: {
  previousSummary: string;
  batch: readonly ConversationMessage[];
}) => Promise<string>;
```

### Default LLM

- System prompt: merge com resumo anterior; preservar decisões, fatos,
  pendências; ~150 tokens; não inventar; não copiar segredos/credenciais.
- Output: string trim min 1.

### Fake (testes)

- Determinístico; registra chamadas; retorna texto derivado de
  `previousSummary` + ids/conteúdos do batch (suficiente para SC-002/003).

## `maybeSummarizeAfterTurn` (orquestração)

Input: store, summarizer, conversationId, optional onError.

1. `total = messageCount`; `record = getSummary`; `covered = record?.coveredCount ?? 0`
2. `batchSel = selectSummaryBatch({ total, covered })`; se undefined → no-op
3. `batch = messagesAscending(id, batchSel.offset, 8)`
4. `next = await summarizer({ previousSummary: record?.summary ?? "", batch })`
5. `upsertSummary(id, next.trim(), covered + 8)`
6. Return `{ summary: next, event: { type: "summarize", content: next } }`
7. On error: onError/log; return undefined (sem avançar ponteiro)

## Test obligations

| Case | Expect |
|---|---|
| total ≤ 8 | select → undefined |
| covered=0, total=16 | select → offset 0 limit 8 |
| covered=0, total=15 | undefined (só 7 fora) |
| covered=8, total=24 | offset 8 limit 8 |
| formatSummaryBlock("") | "" |
| fake summarizer | 1 call com prev+batch no disparo |
