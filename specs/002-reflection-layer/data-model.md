# Data Model: Reflection Layer

## ReflectionOptions

Request-scoped configuration for the decorator.

| Field | Type | Required | Validation |
|---|---|---:|---|
| `maxReflections` | integer | no | Positive; defaults to `2` |
| `criticModel` | configured model/double | no | Uses the base model by default |

`maxReflections` counts critique evaluations. The initial base execution is not a reflection.

## CritiqueResult

Structured output returned by the critic.

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `approved` | boolean | yes | Whether the answer is supported and complete |
| `feedback` | string | yes | Review explanation and regeneration guidance |

Rejected results require non-empty feedback. The schema rejects malformed output.

## CritiqueEvent

Typed trace event appended for every evaluation.

| Field | Type | Meaning |
|---|---|---|
| `type` | `"critique"` | Identifies the event |
| `content` | string | Approval decision and feedback in deterministic display form |

The event preserves the evaluation order among base and regenerated strategy events.

## ReflectionAttempt

Internal request-scoped state for one generated answer.

| Field | Type |
|---|---|
| `answer` | string |
| `trace` | `TraceEvent[]` |
| `metrics` | `Metrics` |
| `reflectionIndex` | positive integer |

The decorator does not mutate caller-owned arrays; each attempt contributes copied events.

## ReflectedStrategyResult

The public result returned by the decorator.

| Field | Type | Rule |
|---|---|---|
| `answer` | string | Approved answer or last answer at the limit |
| `trace` | `TraceEvent[]` | Base/regenerated events plus one critique per attempt |
| `metrics.llmCalls` | integer | Base calls plus critic and regeneration calls |
| `metrics.latencyMs` | non-negative integer | Wall-clock duration of all reflection work |

## State Transitions

```text
initial execution
  -> critic evaluation
  -> approved -> completed
  -> rejected and attempts remain -> regeneration -> critic evaluation
  -> rejected and no attempts remain -> completed with last answer
```
