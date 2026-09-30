# Data Model: Medição de contexto / tokens

## TokenEstimate

Valor derivado de texto; não persistido.

| Field | Type | Rules |
|---|---|---|
| (valor) | `number` (integer) | `Math.floor(text.length / 4)`; texto vazio → `0`; sempre ≥ 0 |

Contagem de caracteres: `String.prototype.length` (UTF-16 code units),
documentado — sem tokenizer de modelo.

## PromptTokenUsage

Uso real reportado pelo provedor via LangChain.

| Field | Type | Rules |
|---|---|---|
| `input_tokens` | number | Inteiro finito ≥ 0 em `usage_metadata` |
| (agregado) `promptTokens` | number \| undefined | Soma dos `input_tokens` válidos do turno; `undefined` se nenhum usage válido |

## ContextBreakdown

Estimativa por fonte do **input composto** do `/chat`.

| Field | Type | Rules |
|---|---|---|
| `memory` | number | `estimateTokens(formatMemoryBlock(facts))` |
| `history` | number | `estimateTokens` do histórico formatado sem mensagem atual |
| `message` | number | `estimateTokens(\`user: ${currentMessage}\`)` |

Todas as chaves **sempre** presentes na resposta HTTP de sucesso.
Soma das três **não** precisa igualar `promptTokens` real (fontes diferentes:
estimado vs provedor; strategy pode acrescentar system/tools).

## ChatMetrics (extensão)

Estende `Metrics` existente.

| Field | Type | Rules |
|---|---|---|
| `llmCalls` | number | Inalterado |
| `latencyMs` | number | Inalterado |
| `historyMessages` | number | Inalterado (0..12) |
| `memoryFacts` | number | Inalterado |
| `learningQueued` | boolean | Inalterado |
| `promptTokens` | number \| undefined | Real; omitir no JSON se undefined |
| `contextBreakdown` | ContextBreakdown | Sempre preenchido pelo HTTP no `/chat` |

## Relationships

```text
POST /chat turn
  ├─ texts (memory, history, message) → ContextBreakdown (estimado)
  └─ strategy.run → Metrics.promptTokens? (real via LangChain usage)
```

Não há entidade de persistência nova.
