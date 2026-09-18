# Research: External Provider Status Tool

## Decision: Use the Statuspage API v2 status payload

**Rationale**: Both requested public pages expose a stable `/api/v2/status.json` shape with `status.indicator` and `status.description`, which is the smallest useful diagnostic payload.

**Alternatives considered**: Scraping HTML was rejected because it is less stable, larger, and harder to validate.

## Decision: Use native fetch with an injected transport seam

**Rationale**: Node.js 22 provides native `fetch` and `AbortSignal.timeout`; injecting the fetch function keeps production behavior simple and tests network-free.

**Alternatives considered**: Adding an HTTP client dependency was rejected because the feature needs only a bounded GET and the project already targets Node 22.

## Decision: Retry network, timeout, and HTTP 5xx failures once

**Rationale**: These failures can be transient and are explicitly requested. A single retry bounds latency and avoids amplifying an unavailable provider.

**Alternatives considered**: Retrying all non-2xx responses was rejected because 4xx responses are not expected to improve on an immediate retry.

## Decision: Return readable error observations from the tool

**Rationale**: Provider availability is diagnostic context, not a local domain invariant. Returning a compact string lets the reasoning agent account for the failure without aborting the whole run.

**Alternatives considered**: Throwing a domain error was rejected because the requirement explicitly treats provider failures as observations.

## Decision: Validate and format only the status fields

**Rationale**: Zod prevents malformed or untrusted response data from entering the trace; one-line formatting keeps model context compact.

**Alternatives considered**: Returning the complete JSON payload was rejected because it adds irrelevant metadata and increases context size.
