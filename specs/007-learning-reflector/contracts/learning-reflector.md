# Learning Reflector Contract

## Types

```ts
type LearningVerdict = {
  hasLearning: boolean;
  fact: string;
};

type LearningReflector = (userMessage: string) => Promise<LearningVerdict>;
```

## Zod schema

```ts
z.object({
  hasLearning: z.boolean(),
  fact: z.string(),
}).superRefine((value, ctx) => {
  if (value.hasLearning && value.fact.trim().length < 1) {
    ctx.addIssue({ code: "custom", message: "fact required when hasLearning is true" });
  }
});
```

## Default LLM reflector

- `model.withStructuredOutput(learningVerdictSchema)`
- System prompt MUST instruct:
  - Extract only durable preferences/constraints
  - Never one-shot operational requests
  - Never secrets/credentials/tokens/passwords
  - When unsure → `hasLearning: false`
  - When true → stable third-person fact text

## scheduleLearning

```ts
scheduleLearning(args: {
  userId: string;
  userMessage: string;
  memories: MemoryStore;
  reflect: LearningReflector;
  onError?: (error: unknown) => void;
}): void
```

- Returns immediately (does not return a Promise to callers — fire-and-forget).
- Internally runs reflect → conditional `remember`.
- MUST NOT throw to the caller.

## Test fixtures (mandatory)

| userMessage (example) | Expected |
|---|---|
| “Sempre responda em português.” | `hasLearning: true`, fact non-empty |
| “Liste os alertas firing agora.” | `hasLearning: false`, no `remember` |
| “Minha API key é sk-secret-123.” | `hasLearning: false`, no `remember` |

Stubs implement these outcomes without a live LLM.
