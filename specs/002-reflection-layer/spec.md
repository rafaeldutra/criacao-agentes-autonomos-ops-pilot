# Feature Specification: Reflection Layer

**Feature Branch**: `002-reflection-layer`
**Created**: 2026-09-10
**Status**: Draft
**Input**: User description: "Camada Reflection: withReflection(strategy, opts) decora qualquer ReasoingStrategy: executa a base; um crítico (mesmo modelo, saída estruturada { approved, feedback}) avalia a resposta contra as observações do trace; se reprovar, regenera com o feedback no contexto; para um approved ou maxReflections (default 2). Evento "critique" no trace; métricas somam as chamadas extras. Arena: reflect:react e reflect:plan-and-execute"

## User Scenarios & Testing

### User Story 1 - Validating a strategy answer (Priority: P1)

As an on-call operator, I want an executed strategy answer to be reviewed against its observed evidence so that unsupported or incomplete operational conclusions are not presented as final.

**Why this priority**: Reflection is valuable only when it improves trust in the existing strategies' answers.

**Independent Test**: Run a decorated strategy with a deterministic critic that approves the answer and verify the original answer, critique event, and additional model-call metric.

**Acceptance Scenarios**:

1. **Given** a strategy returns an answer and typed trace observations, **When** the reflection critic approves it, **Then** the decorated strategy returns the answer and appends an approved critique event.
2. **Given** a strategy returns an answer without observations, **When** the critic evaluates it, **Then** the result still includes a critique event and does not claim evidence that is absent.

---

### User Story 2 - Regenerating with feedback (Priority: P1)

As an on-call operator, I want a rejected answer to be regenerated with explicit critic feedback so that the final response addresses the identified gap.

**Why this priority**: A rejected answer must lead to an actionable correction rather than merely exposing a warning.

**Independent Test**: Use a deterministic critic that rejects the first answer and approves the second, then verify the feedback is included in the regeneration context and the final answer is the corrected one.

**Acceptance Scenarios**:

1. **Given** the critic rejects an answer with feedback, **When** reflection continues, **Then** the base strategy runs again with the original request, observations, prior answer, and feedback in context.
2. **Given** a regenerated answer is approved, **When** the decorated strategy completes, **Then** the trace preserves both critique events and the final answer event.
3. **Given** the critic rejects every attempt, **When** the configured reflection limit is reached, **Then** the decorator returns the last generated answer and records the final feedback without retrying further.

---

### User Story 3 - Selecting reflection from the Arena (Priority: P2)

As an operator comparing reasoning strategies, I want to run reflection around either supported strategy from the Arena so that I can compare answers with and without review.

**Why this priority**: Reflection must be usable through the existing operational entry point, not only as an internal library function.

**Independent Test**: Invoke the Arena with `reflect:react` and `reflect:plan-and-execute` using deterministic or mocked model responses and verify each alias selects the corresponding decorated strategy.

**Acceptance Scenarios**:

1. **Given** the Arena receives `reflect:react`, **When** it resolves strategies, **Then** it runs ReAct wrapped by Reflection.
2. **Given** the Arena receives `reflect:plan-and-execute`, **When** it resolves strategies, **Then** it runs Plan-and-Execute wrapped by Reflection.
3. **Given** an unsupported reflection alias, **When** the Arena parses the request, **Then** it reports an explicit strategy error and does not silently fall back.

### Edge Cases

- The critic returns invalid structured data; the failure is surfaced instead of being treated as approval.
- `maxReflections` is zero, negative, non-integer, or otherwise invalid; the option is rejected before model execution.
- The base strategy fails during regeneration; the domain or model error is propagated with the accumulated trace available to the caller when supported.
- The critic feedback is empty or whitespace-only; a rejected critique must not be accepted without actionable feedback.
- The final attempt is rejected; the decorator must return the last answer and must not exceed the configured reflection count.
- Reflection must not mutate the base strategy's input, options, or caller-owned trace arrays.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST provide a `withReflection(strategy, opts)` decorator that accepts any existing reasoning strategy and preserves its public result contract.
- **FR-002**: The decorator MUST execute the base strategy before the first critique.
- **FR-003**: The critic MUST evaluate each answer against the observations present in the strategy trace and return structured `approved` and `feedback` values.
- **FR-004**: The critic MUST use the same configured model family as the decorated strategy unless the caller explicitly supplies a supported critic configuration.
- **FR-005**: For every critique attempt, the system MUST append a typed `critique` event containing the approval decision and feedback.
- **FR-006**: When a critique rejects an answer, the system MUST regenerate by invoking the base strategy with the original input and the rejection feedback in its context.
- **FR-007**: The decorator MUST stop immediately after an approved critique.
- **FR-008**: The decorator MUST stop after `maxReflections` critique attempts, with a default of 2, and return the last generated answer when no attempt is approved.
- **FR-009**: Reflection metrics MUST include all additional critic and regeneration model calls while preserving the base strategy's measured calls and latency.
- **FR-010**: The decorator MUST expose the complete trace, including original strategy events, critique events, regenerated strategy events, and the final answer.
- **FR-011**: The Arena MUST support the aliases `reflect:react` and `reflect:plan-and-execute`, each mapping to the corresponding decorated strategy.
- **FR-012**: Invalid reflection options, malformed critic output, and unsupported aliases MUST produce explicit errors and MUST NOT silently select a different strategy.
- **FR-013**: Reflection behavior MUST be testable without network access through injectable deterministic strategy and critic/model doubles.

### Key Entities

- **Reflection Options**: Configuration for the critic and the maximum number of critique attempts.
- **Critique Result**: A structured approval decision and feedback explaining why the answer passed or failed.
- **Critique Event**: A typed trace event recording an approval decision and feedback.
- **Reflected Strategy Result**: The decorated strategy answer, accumulated trace, and metrics across all attempts.
- **Arena Strategy Alias**: A user-facing name that selects a base strategy with Reflection enabled.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every reflected execution records exactly one critique event per critique attempt, including when the final attempt is rejected.
- **SC-002**: A reflected execution never performs more than the configured `maxReflections` critique attempts, and defaults to no more than 2.
- **SC-003**: In deterministic acceptance tests, a rejected first answer is replaced by an approved regenerated answer while retaining the rejection feedback in the trace.
- **SC-004**: Metrics from reflected executions equal the base strategy metrics plus all critic and regeneration calls, with no calls hidden or double-counted.
- **SC-005**: Both reflection aliases resolve to the correct base strategy in 100% of parser and strategy-selection tests.
- **SC-006**: Existing non-reflected strategy executions produce the same answer and trace behavior as before the feature is enabled.

## Assumptions

- Reflection is opt-in; existing `react` and `plan-and-execute` Arena names remain unchanged.
- `maxReflections` counts critic evaluations, not the initial base execution.
- A rejected final attempt returns the last answer because no approved replacement exists.
- Regeneration context is supplied through the strategy's existing input/context mechanism without changing the public `ReasoningStrategy` contract.
- The same OpenRouter model configuration used by the base strategy is the default critic model.
- The misspelled alias in the request is interpreted as `reflect:react`; the supported public spelling is `reflect:react`.
