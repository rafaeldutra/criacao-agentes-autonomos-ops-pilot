# Contract: Conversation summary store

Extende `ConversationStore` (005).

## Schema (SQLite)

```sql
CREATE TABLE IF NOT EXISTS conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
  summary TEXT NOT NULL,
  covered_count INTEGER NOT NULL CHECK (covered_count >= 0),
  updated_at TEXT NOT NULL
);
```

Idempotente junto do schema existente de `conversations` / `messages`.

## API additions

```ts
type ConversationSummaryRecord = {
  conversationId: string;
  summary: string;
  coveredCount: number;
  updatedAt: string;
};

interface ConversationStore {
  // ... existing ...
  getSummary(conversationId: string): ConversationSummaryRecord | undefined;
  upsertSummary(conversationId: string, summary: string, coveredCount: number): void;
  messageCount(conversationId: string): number;
  messagesAscending(conversationId: string, offset: number, limit: number): ConversationMessage[];
}
```

## Behaviors

| Call | Rules |
|---|---|
| qualquer método com id desconhecido | `DomainError` + `CONVERSATION_NOT_FOUND` |
| `getSummary` sem linha | `undefined` |
| `upsertSummary` | INSERT ou REPLACE/UPDATE 1:1; `summary` trim min 1; `coveredCount` int ≥ 0 |
| `messagesAscending` | oldest→newest; `offset`/`limit` ints ≥ 0; slice estável |
| `messageCount` | total de mensagens da conversa |

## Fake

`FakeConversationStore` implementa o mesmo contrato em memória.

## Test obligations

| Case | Expect |
|---|---|
| DDL `:memory:` | tabela `conversation_summaries` existe |
| upsert + get | round-trip summary e coveredCount |
| segundo upsert | sobrescreve (1 linha) |
| id desconhecido | CONVERSATION_NOT_FOUND |
| messagesAscending offset/limit | ordem e fatia corretas |
