# Tool Contract: forget_preference

## Registration

Added by `createTools` when `memories: MemoryStore` is provided.

| Property | Value |
|---|---|
| `name` | `forget_preference` |
| `description` | Remove a previously learned user preference from semantic memory |

## Input schema (Zod)

```ts
z.object({
  preference: z.string().trim().min(1).describe(
    "Description of the preference or fact to forget",
  ),
});
```

**No `userId` field** — identity comes from request context `getUserId()`.

## Behaviour

1. `userId = getUserId()` — if missing → return error string (no throw to crash agent).
2. `hits = await memories.recall(userId, preference)`.
3. If `hits.length === 0` → `"No matching preference found."`
4. Else `memories.forget(hits[0].id)` → `"Forgotten: <fact>"`.

## Tests

- Seed fact for `u1`, call tool with related preference text → fact gone on recall.
- Unknown preference → nothing forgotten message.
- Missing `userId` → clear error string.
- Strategies/tools list includes `forget_preference` when memories configured.
