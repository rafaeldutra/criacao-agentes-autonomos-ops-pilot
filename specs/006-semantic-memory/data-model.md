# Data Model: Memória semântica

## Store boundary

`MemoryStore` é a interface de persistência de fatos semânticos por usuário,
implementada por `SqliteMemoryStore` e opcionalmente `FakeMemoryStore`.

Operações obrigatórias:

- `remember(userId, fact): Promise<RememberResult>` — embute o fato; insere se
  não houver memória do mesmo usuário com produto escalar > 0.92; caso
  contrário devolve a existente com `created: false`
- `recall(userId, query): Promise<RecalledMemory[]>` — até 3 fatos com
  `score >= 0.3`, ordenados por score decrescente
- `forget(id): void` — remove por PK; id inexistente = no-op
- `close(): void` — encerra `DatabaseSync` (no-op no fake)

Dependência injetável: `embed(text) => Promise<Float32Array>` (default:
singleton em `embeddings.ts`).

## Domain types

### Memory (persistido)

| Field | Type | Rules |
|---|---|---|
| `id` | string | PK estável (ex.: UUID) |
| `userId` | string | Isolamento; não vazio |
| `fact` | string | trim, min 1 |
| `embedding` | Float32Array | Normalizado (norma ~1); dim 384 |
| `createdAt` | string | ISO-8601 |

### RememberResult

| Field | Type | Rules |
|---|---|---|
| `id` | string | Id inserido ou o da memória deduplicada |
| `created` | boolean | `true` se nova linha; `false` se dedup |

### RecalledMemory

| Field | Type | Rules |
|---|---|---|
| `id` | string | PK |
| `fact` | string | Texto original |
| `score` | number | Produto escalar ∈ [-1, 1] (na prática ≥ 0.3) |

### Metrics (extensão)

| Field | Type | Rules |
|---|---|---|
| `llmCalls` | number | Existente |
| `latencyMs` | number | Existente |
| `historyMessages` | number | Existente (0–12) |
| `memoryFacts` | number | 0–3; fatos injetados no turno (composição) |

## SQLite table

### memories

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `user_id` | TEXT | Required; índice |
| `fact` | TEXT | Required, não vazio |
| `embedding` | BLOB | Required; `byteLength = 384 * 4` |
| `created_at` | TEXT | ISO timestamp, required |

Índice recomendado: `(user_id)` para listar candidatos de recall/dedup.

DDL criado de forma idempotente no construtor do store (padrão
`SqliteConversationStore` / `SqliteOpsStore`).

## Validation rules

- `fact` vazio/whitespace → rejeição (throw de argumento ou `DomainError`)
  antes de embed.
- `userId` vazio → rejeição na fronteira do store ou Zod (HTTP).
- Dedup compara apenas linhas com o mesmo `user_id`.
- `recall` sem candidatos ≥ 0.3 → `[]`.
- `forget` de id inexistente → no-op.
- SQL apenas com parâmetros vinculados.

## Ranking rules (constantes v1)

| Constant | Value | Uso |
|---|---|---|
| `DEDUP_THRESHOLD` | `0.92` | `remember`: se max score > 0.92 → não inserir |
| `RECALL_MIN_SCORE` | `0.3` | Filtrar recall |
| `RECALL_TOP_K` | `3` | Limite de resultados |

Produto escalar sobre vetores já normalizados ≡ similaridade de cosseno.

## State / lifecycle

1. `remember` → (opcional) nova linha em `memories`.
2. Turno `/chat` com `userId`: `recall(userId, message)` → compor prompt →
   (histórico 005) → `strategy.run` → resposta com `metrics.memoryFacts`.
3. `forget(id)` → linha removida; recalls posteriores não a incluem.
4. Sem `userId` no chat → sem leitura/escrita de memória neste turno.

## Relationships

- Um `userId` tem N `Memory`.
- `ChatRequest` ganha `userId?`; composição une memórias + histórico de
  conversa + mensagem atual.
- Complementa (não substitui) `ConversationStore` / janela de 12 mensagens.
