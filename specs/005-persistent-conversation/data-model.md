# Data Model: Conversa persistente

## Store boundary

`ConversationStore` é a interface síncrona de persistência de conversas,
implementada por `SqliteConversationStore` e `FakeConversationStore`.

Operações obrigatórias:

- `create(): string` — aloca e devolve um novo `conversationId`
- `append(conversationId, role, content): void` — persiste uma mensagem
- `lastMessages(conversationId, limit): ConversationMessage[]` — até `limit`
  mensagens mais recentes, em ordem cronológica crescente
- `exists(conversationId): boolean` — (recomendado) permite a borda HTTP
  rejeitar ids desconhecidos antes do run; pode ser derivado de consulta
  interna se preferir API mínima
- `close(): void` — encerra recursos do `DatabaseSync` (no-op no fake)

## Domain types

### ConversationMessage

| Field | Type | Rules |
|---|---|---|
| `id` | string | Identificador estável da mensagem |
| `conversationId` | string | Dono da mensagem |
| `role` | `"user" \| "assistant"` | Conjunto fechado |
| `content` | string | Não vazio na prática de `/chat` |
| `createdAt` | string | ISO-8601 |

### Metrics (extensão)

| Field | Type | Rules |
|---|---|---|
| `llmCalls` | number | Existente |
| `latencyMs` | number | Existente |
| `historyMessages` | number | 0–12; mensagens anteriores injetadas no turno |

## SQLite tables

### conversations

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `created_at` | TEXT | ISO timestamp, required |

### messages

| Column | Type | Rules |
|---|---|---|
| `id` | TEXT | Primary key |
| `conversation_id` | TEXT | FK → `conversations(id)` |
| `role` | TEXT | CHECK IN (`user`, `assistant`) |
| `content` | TEXT | Required |
| `created_at` | TEXT | ISO timestamp, required |

Índice recomendado: `(conversation_id, created_at)` para `lastMessages`.

## Validation rules

- `role` fora do conjunto fechado → rejeição no store (throw) ou na validação
  chamadora.
- `append` em `conversationId` inexistente → `DomainError`
  `CONVERSATION_NOT_FOUND`.
- `lastMessages` em conversa existente sem mensagens → `[]`.
- `lastMessages` com `limit <= 0` → erro de argumento (ou treat as 0 → `[]`);
  a composição sempre passa `12`.
- Ordenação: selecionar as N mais recentes e devolver em ordem cronológica
  crescente (mais antiga → mais recente).

## State / lifecycle

1. `create` → conversa vazia.
2. Turno `/chat`: validar/criar id → carregar histórico (0–12) →
   `append(user)` → `strategy.run` → `append(assistant)` → resposta com
   `conversationId` + `historyMessages`.
3. Sem transição de status; conversas não são arquivadas na v1.

## Relationships

- Uma `Conversation` tem N `Message`.
- `ChatResponse` = `ReasoningResult` + `conversationId`, com
  `metrics.historyMessages` preenchido na composição.
