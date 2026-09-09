# Arena Contract

## CLI

```text
npm run arena -- [--strategies react,plan-and-execute] [--max-iterations N]
```

- `--strategies` selects one or more registered strategies. If omitted, the arena runs the default set.
- `--max-iterations` sets the iteration limit for every selected strategy.
- The same input is passed to every selected strategy.

## Output

For each selected strategy, print:

1. strategy name;
2. final answer;
3. ordered trace events;
4. `llmCalls` and `latencyMs`.

Invalid strategy names, malformed flags and non-positive iteration limits produce a clear CLI error and non-zero exit status.
