# Data Model: Sumarização de histórico

## ConversationSummaryRecord

Persistido em `conversation_summaries` (1:1 com `conversations`).

| Field | Type | Rules |
|---|---|---|
| `conversationId` | string | PK / FK → `conversations.id` |
| `summary` | string | trim, min 1 quando persistido |
| `coveredCount` | number (int) | ≥ 0; mensagens oldest já absorvidas |
| `updatedAt` | string (ISO) | atualizado a cada upsert |

## SummaryBatch

Conceito de runtime (não tabela).

| Field | Type | Rules |
|---|---|---|
| `messages` | `ConversationMessage[8]` | Exatamente 8; oldest→newest; índices `coveredCount .. coveredCount+7` |
| `offset` | number | Igual ao `coveredCount` atual no disparo |

## BatchEligibility (puro)

Input: `{ totalMessages, coveredCount, windowSize: 8 }`.

| Resultado | Condição |
|---|---|
| `undefined` | `totalMessages <= windowSize` **ou** `(totalMessages - windowSize - coveredCount) < 8` |
| `{ offset: coveredCount, limit: 8 }` | caso contrário |

Pós-sucesso: `coveredCount' = coveredCount + 8`.

## HistorySummarizer I/O

| Field | Type | Rules |
|---|---|---|
| `previousSummary` | string | Pode ser `""` no primeiro lote |
| `batch` | 8 messages | Obrigatório |
| output | string | trim, min 1; ~150 tokens alvo instrucional |

## TraceEvent `summarize`

| Field | Type | Rules |
|---|---|---|
| `type` | `"summarize"` | Literal |
| `content` | string | Resumo resultante (ou prefixo legível + resumo) |

## Relationships

```text
conversations 1──1 conversation_summaries
conversations 1──* messages

messages[0 .. coveredCount)
  → já representadas no summary text
messages[coveredCount .. n-8)
  → fora da janela, ainda não cobertas (acumulam até lote de 8)
messages[n-8 .. n)
  → janela raw no prompt
```

## State transitions

1. Sem resumo, `coveredCount` implícito 0.
2. Lote elegível → summarizer → upsert (`summary`, `coveredCount+8`).
3. Falha summarizer/upsert → estado anterior inalterado.
4. Próximos turnos usam `getSummary` no compose até o próximo lote.
