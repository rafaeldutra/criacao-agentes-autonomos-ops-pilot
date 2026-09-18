# Provider Status Tool Contract

## Tool input

```json
{
  "provider": "github"
}
```

`provider` is an enum of `github` and `cloudflare`, defaults to `github`, and is described as a diagnostic check for suspected external-provider or dependency outages.

## Endpoint mapping

The tool performs a read-only GET against the endpoint associated with the provider. No credentials or chat endpoint is used.

## Valid response

```json
{
  "status": {
    "indicator": "none",
    "description": "All Systems Operational"
  }
}
```

## Success result

The result contains only provider, indicator, and description in one line. Unrelated response fields are not returned.

## Failure result

Network errors, timeout after both attempts, invalid JSON, invalid schema, non-retryable HTTP errors, and exhausted 5xx retries return readable one-line strings. They do not throw outside the tool invocation.

## Retry contract

- Attempt 1 is always made.
- Network errors, abort timeouts, and HTTP 5xx permit exactly attempt 2.
- Attempt 2 is final.
- HTTP statuses outside 2xx and 5xx are final without retry.
