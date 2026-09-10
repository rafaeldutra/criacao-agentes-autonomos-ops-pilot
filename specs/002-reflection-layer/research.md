# Research: Reflection Layer

## Decision: Decorate the existing ReasoningStrategy contract

**Rationale**: The contract already returns `answer`, typed `trace`, and `metrics`; a decorator can compose these without coupling Reflection to ReAct or Plan-and-Execute internals.

**Alternatives considered**: Embedding critique loops inside each strategy would duplicate retry, trace, and metric logic and make future strategies harder to review.

## Decision: Validate critic output with a structured schema

**Rationale**: The project already uses Zod at external/model boundaries. The critic must produce a boolean `approved` and non-empty `feedback`, preventing ambiguous approval or silent malformed output.

**Alternatives considered**: Parsing free-form text was rejected because it is nondeterministic and can hide invalid model output.

## Decision: Carry regeneration feedback through an internal context envelope

**Rationale**: The public strategy input remains a string, while each retry receives the original request plus clearly delimited prior answer, observations, and critic feedback. This works for both current strategies without changing their interface.

**Alternatives considered**: Adding a required field to `ReasoningOptions` would expose reflection-specific state to every strategy and risk changing existing callers.

## Decision: Count critic calls and regenerated strategy calls additively

**Rationale**: Metrics must represent all model work. The initial base metrics are retained; each critic invocation and each regeneration invocation increments `llmCalls`, and total latency spans the decorator execution.

**Alternatives considered**: Replacing base metrics was rejected because it would hide work performed by the decorated strategy.

## Decision: Reflection aliases are opt-in and preserve existing names

**Rationale**: `react` and `plan-and-execute` must remain behavior-compatible. `reflect:react` and `reflect:plan-and-execute` explicitly select the decorator.

**Alternatives considered**: Making reflection the default would change latency, cost, and output behavior for existing Arena users.
