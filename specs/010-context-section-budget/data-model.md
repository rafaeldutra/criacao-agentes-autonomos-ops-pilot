# Data Model: ContextBuilder com orçamento por seção

Sem persistência nova. Entidades em memória no turno de composição.

## SectionBudget

Tetos por seção orçável (tokens estimados).

| Field | Type | Rules |
|-------|------|-------|
| `summary` | `number` | Inteiro finito ≥ 0; default **200** |
| `window` | `number` | Inteiro finito ≥ 0; default **1200** |
| `memories` | `number` | Inteiro finito ≥ 0; default **300** |

**Env mapping**:

| Field | Env var | Default |
|-------|---------|---------|
| `summary` | `CONTEXT_BUDGET_SUMMARY` | 200 |
| `window` | `CONTEXT_BUDGET_WINDOW` | 1200 |
| `memories` | `CONTEXT_BUDGET_MEMORIES` | 300 |

**Validation** (`loadSectionBudgets`): parse `Number`; se `NaN`, não finito ou
`< 0` → default da seção. Não lança.

## ContextBuildInput

Entrada bruta (pré-corte).

| Field | Type | Rules |
|-------|------|-------|
| `system` | `string` | Opcional; vazio/omitido → seção omitida; **intocável** |
| `summary` | `string` | Texto bruto do resumo (sem wrapper); vazio → omitir |
| `memories` | `RecalledMemory[]` | `{ id, fact, score }`; ordem de entrada usada no desempate |
| `history` | `ConversationMessage[]` | Já na janela raw (≤ 8), oldest→newest |
| `message` | `string` | Mensagem atual do usuário; **intocável** |

## ContextSections (pós-corte)

Textos já formatados (ou vazios) após orçamento.

| Field | Type | Meaning |
|-------|------|---------|
| `system` | `string` | Cópia intacta de `input.system` (ou `""`) |
| `summary` | `string` | `formatSummaryBlock(trimmedRaw)` ou `""` |
| `memory` | `string` | `formatMemoryBlock(keptFacts)` ou `""` |
| `history` | `string` | `formatHistoryOnly(keptMessages)` ou `""` |
| `message` | `string` | `user: ${input.message}` (formato atual) |

## ContextBuildResult

| Field | Type | Meaning |
|-------|------|---------|
| `prompt` | `string` | Concatenação na ordem system→summary→memory→history→message, omitindo vazios (sem separador extra além do que cada format já inclui) |
| `sections` | `ContextSections` | Partes pós-corte (para breakdown/métricas) |
| `keptHistory` | `ConversationMessage[]` | Mensagens que entraram na janela após corte |
| `keptMemories` | `RecalledMemory[]` | Fatos que entraram após corte |

## Relationships

```text
SectionBudget ──applies-to──► ContextBuildInput
ContextBuildInput ──buildContext──► ContextBuildResult
ContextBuildResult.sections ──► buildContextBreakdown (008)
ContextBuildResult.prompt ──► strategy.run
```

## State / transitions (por seção orçável)

### Window

`history[]` → drop oldest enquanto over budget e length > 1 → `keptHistory`
(mínimo 1 se havia ≥ 1).

### Memories

`memories[]` → drop lowest score (tie: menor índice) enquanto over budget →
`keptMemories` (pode ficar vazio).

### Summary

`summary` raw → truncate end enquanto `formatSummaryBlock` over budget →
trimmed raw → formatted (pode ficar `""`).

### System / message

Identidade: saída = entrada formatada; nunca removidos pelo budget.
