# Contract: `src/context/tokens`

## `estimateTokens`

```ts
estimateTokens(text: string): number
```

- Retorna `Math.floor(text.length / 4)`.
- `"abcdefghij"` (10) → `2`; `""` → `0`.

## `promptTokensFromUsage`

```ts
promptTokensFromUsage(usage: unknown): number | undefined
```

- Se `usage` é objeto com `input_tokens` number finito ≥ 0 → esse número.
- Caso contrário → `undefined` (não lança).

## `sumPromptTokensFromMessages`

```ts
sumPromptTokensFromMessages(messages: readonly BaseMessage[]): number | undefined
```

- Para cada mensagem com `getType() === "ai"` (ou `AIMessage`), lê
  `usage_metadata` via `promptTokensFromUsage`.
- Se nenhum usage válido → `undefined`.
- Senão → soma dos valores válidos.

## `buildContextBreakdown`

```ts
type ContextBreakdown = {
  memory: number;
  history: number;
  message: number;
};

buildContextBreakdown(parts: {
  memory: string;
  history: string;
  message: string;
}): ContextBreakdown
```

- Cada campo = `estimateTokens(parts.<fonte>)`.

## Test obligations

| Case | Expect |
|---|---|
| 10 chars | `2` |
| empty | `0` |
| 3 chars | `0` |
| usage `{ input_tokens: 42 }` | `42` |
| usage missing / invalid | `undefined` |
| two AI messages 10+5 | sum `15` |
| no AI usage | `undefined` |
| breakdown parts known | per-source floor |
