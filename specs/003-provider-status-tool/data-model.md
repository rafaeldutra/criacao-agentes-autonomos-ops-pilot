# Data Model: External Provider Status Tool

## Provider

Supported external provider identifier.

| Value | Endpoint |
|---|---|
| `github` | `https://www.githubstatus.com/api/v2/status.json` |
| `cloudflare` | `https://www.cloudflarestatus.com/api/v2/status.json` |

The input default is `github`.

## ProviderStatusPayload

Validated remote response.

| Field | Type | Required |
|---|---|---:|
| `status` | object | yes |
| `status.indicator` | string | yes |
| `status.description` | string | yes |

Additional remote fields are ignored after validation.

## StatusCheckAttempt

One HTTP attempt.

| Field | Type | Meaning |
|---|---|---|
| `provider` | Provider | Endpoint selected |
| `attempt` | `1 \| 2` | Retry position |
| `outcome` | success/failure | Transport, HTTP, JSON, or validation result |
| `retryable` | boolean | Whether one retry remains |

Every attempt has a five-second abort deadline.

## StatusObservation

The tool result consumed by a strategy.

Success format:

```text
github: operational - All Systems Operational
```

Failure format:

```text
github status check failed after 2 attempts: request timed out
```

Both are single-line strings.

## State Transitions

```text
input validated
  -> request attempt
  -> valid 2xx payload -> compact success observation
  -> network/timeout/5xx -> one retry -> success or compact error observation
  -> non-retryable HTTP/JSON/schema failure -> compact error observation
```
