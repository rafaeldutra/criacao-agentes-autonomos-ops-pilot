# Reasoning Strategy Contract

## Input

```ts
type ReasoningInput = string;

type ReasoningOptions = {
  maxIterations?: number;
};
```

## Output

```ts
type ReasoningResult = {
  answer: string;
  trace: TraceEvent[];
  metrics: {
    llmCalls: number;
    latencyMs: number;
  };
};
```

Every strategy exposes a stable `name` and a `run(input, options)` operation. `trace` is ordered and uses the discriminated event types `thought`, `action`, `observation`, `plan`, `critique` and `answer`.

## Limits

- `maxIterations` is a positive integer when supplied.
- A strategy must stop before starting another iteration after reaching the limit.
- Plan-and-Execute must not execute more than eight plan steps.
