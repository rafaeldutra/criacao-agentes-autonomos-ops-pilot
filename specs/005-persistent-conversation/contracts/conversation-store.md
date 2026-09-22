# ConversationStore Contract

## Construction

```ts
new SqliteConversationStore(path?: string)
new FakeConversationStore()
```

- `SqliteConversationStore`: path explícito vence; senão `OPSPILOT_DB`; senão
  `./data/opspilot.db`. Testes passam `":memory:"`.
- Construtor SQLite cria `conversations` e `messages` de forma idempotente e
  habilita foreign keys.
- Fake não toca filesystem.

## Operations

```ts
create(): string
append(conversationId: string, role: "user" | "assistant", content: string): void
lastMessages(conversationId: string, limit: number): ConversationMessage[]
exists(conversationId: string): boolean
close(): void
```

### create

- Gera id único (ex.: `conv-` + timestamp/random).
- Insere linha em `conversations`.
- Devolve o id.

### append

- Exige conversa existente; caso contrário `DomainError` /
  `CONVERSATION_NOT_FOUND`.
- Persiste `role`, `content`, `created_at`.
- Não concatena SQL com conteúdo ou ids — apenas binds.

### lastMessages

- Se a conversa não existe → `CONVERSATION_NOT_FOUND` (ou lista vazia apenas
  quando `exists` já foi checado pela composição; preferir erro explícito para
  ids inválidos).
- Conversa vazia → `[]`.
- Retorna no máximo `limit` mensagens, ordem cronológica crescente.

## Error behavior

| Caso | Código |
|---|---|
| Conversa inexistente em `append` / `lastMessages` / uso HTTP | `CONVERSATION_NOT_FOUND` |
| Role inválido | throw de validação / CHECK SQLite |
| Path vazio (`OPSPILOT_DB` blank) | Error de configuração |

## Persistence guarantees

- DDL idempotente (`CREATE TABLE IF NOT EXISTS`).
- Prepared statements para todo DML/SELECT.
- Fake e SQLite observam a mesma ordem e semântica de limite nos testes de
  contrato.
