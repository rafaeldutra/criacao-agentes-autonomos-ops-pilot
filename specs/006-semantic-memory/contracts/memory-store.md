# MemoryStore Contract

## Interface

```ts
type RememberResult = { id: string; created: boolean };

type RecalledMemory = {
  id: string;
  fact: string;
  score: number;
};

interface MemoryStore {
  remember(userId: string, fact: string): Promise<RememberResult>;
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
  forget(id: string): void;
  close(): void;
}
```

Implementações: `SqliteMemoryStore`, `FakeMemoryStore` (testes HTTP).

## Embeddings

- Módulo: `src/memory/embeddings.ts`
- `embed(text: string): Promise<Float32Array>`
- Pipeline lazy singleton: `feature-extraction` /
  `Xenova/all-MiniLM-L6-v2` com `{ pooling: "mean", normalize: true }`
- Dimensão: 384
- Store SQLite recebe `embed` por DI (default = singleton)

## Behaviour

### remember

1. Validar `userId` e `fact` (trim, min 1).
2. `vector = await embed(fact)`.
3. Carregar memórias do `userId`; se algum produto escalar > `0.92`,
   retornar `{ id: existingId, created: false }` sem INSERT.
4. Caso contrário INSERT (`id`, `user_id`, `fact`, BLOB, `created_at`) e
   retornar `{ id, created: true }`.

### recall

1. Validar `userId` e `query`.
2. `queryVec = await embed(query)`.
3. Score = produto escalar contra cada memória do usuário.
4. Filtrar `score >= 0.3`, ordenar desc, retornar no máximo 3
   `{ id, fact, score }`.
5. Sem candidatos → `[]`.

### forget

- `DELETE FROM memories WHERE id = ?`
- 0 rows affected → no-op

## Mandatory semantic test

```text
remember(userId, "O usuário prefere café sem açúcar")
recall(userId, "How does he like his coffee?")
→ inclui o fato no top-3 com score >= 0.3
(sem exigir palavras em comum entre fact e query)
```

## Isolation test

Memórias de `user-a` nunca aparecem no `recall` de `user-b`.

## SQLite notes

- Path: `OPSPILOT_DB` / `./data/opspilot.db` / `:memory:` nos testes
- DDL idempotente da tabela `memories` (ver [data-model.md](../data-model.md))
- Prepared statements only; BLOB = Float32 LE
