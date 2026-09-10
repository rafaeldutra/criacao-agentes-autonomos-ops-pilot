# Reflection Decorator Contract

## Factory

```text
withReflection(strategy, options?) -> ReasoningStrategy
```

The returned strategy keeps the base strategy name with a reflection marker suitable for Arena output and preserves the `run(input, options?)` method.

## Critic input

The critic receives:

- the original user input;
- the current answer;
- observation events from the current trace;
- the current reflection number;
- prior feedback when regenerating.

## Critic output

```json
{
  "approved": true,
  "feedback": "The answer is supported by the observed tool results."
}
```

The output is structured and validated. Invalid output is an explicit error.

## Execution rules

1. Run the base strategy once.
2. Evaluate the result.
3. Append one `critique` event.
4. Return immediately when approved.
5. When rejected and attempts remain, run the base strategy again with feedback context.
6. Stop after `maxReflections` evaluations, defaulting to 2.
7. Return the last result if the final evaluation is rejected.

## Metrics rules

`llmCalls` equals the sum of base strategy calls and critic calls. `latencyMs` measures the complete decorator execution. No base metric is discarded.
