# Feature Specification: External Provider Status Tool

**Feature Branch**: `003-provider-status-tool`
**Created**: 2026-09-17
**Status**: Draft
**Input**: User description: "Tool de status de provedores externos: Tool check_provider_status em src/agents/tools.ts: consultar a status page pública do provedor via API statuspage.io (sem chat): github -> https://www.githubstatus.com/api/v2/status.json; cloudflare -> https://www.cloudflarestatus.com/api/v2/status.json. Parâmetro provider (enum: github | cloudflare, default github, describe explicando). Descrição orientada a quando usar: suspeita de problema externo, 'é o nosso ou de um provedor?', dependência fora do ar. Resiliência: timeout de 5s via AbortSignal.timeout; falha de rede ou 5xx, uma nova tentativa; resposta validada com zod ({ status: { indicador, description} }); qualquer falha final retorna string de erro legível como resultado da tool (erro é observação - nunca lançar exceção para fora da tool). Retorno compacto (indicador + descrição, uma linha), para não inflar o contexto. Teste: a função de fetch é injetável; testes cobrem sucesso, timeout e resposta inválida sem uso de rede (fake fetch)"

## User Scenarios & Testing

### User Story 1 - Checking an external dependency (Priority: P1)

As an on-call operator, I want to check the public status of GitHub or Cloudflare so that I can distinguish an internal incident from an outage in an external dependency.

**Why this priority**: Identifying an external provider outage is a high-value first diagnostic step during an incident.

**Independent Test**: Invoke the tool with a fake fetch that returns a valid provider status and verify that the result contains only the indicator and description in one compact line.

**Acceptance Scenarios**:

1. **Given** no provider is supplied, **When** the tool is invoked, **Then** it checks GitHub using the default provider.
2. **Given** `github` or `cloudflare` is supplied, **When** the provider status is available, **Then** the tool queries the matching public status endpoint and returns its indicator and description compactly.
3. **Given** an operator suspects an external dependency is down, **When** the tool is selected, **Then** its description makes clear that it is intended to distinguish provider incidents from local incidents.

---

### User Story 2 - Handling unreliable status pages (Priority: P1)

As an on-call operator, I want transient provider-status failures to be retried and reported safely so that a status check does not interrupt the reasoning flow.

**Why this priority**: Network failures and provider errors are expected during incidents and must become useful observations rather than uncaught failures.

**Independent Test**: Invoke the tool with fake fetch implementations that timeout, fail, return server errors, or return malformed data, and verify retry behavior and readable string results.

**Acceptance Scenarios**:

1. **Given** the first request fails due to network failure or a server error, **When** the tool retries, **Then** it makes exactly one additional attempt.
2. **Given** both attempts fail, **When** the tool completes, **Then** it returns a readable error string and does not throw outside the tool.
3. **Given** the provider response has an unexpected shape, **When** validation runs, **Then** the tool returns a readable invalid-response observation and does not expose unvalidated fields.
4. **Given** a request exceeds five seconds, **When** the timeout occurs, **Then** the attempt is treated as failed and the retry policy is applied once.

---

### User Story 3 - Keeping reasoning context compact (Priority: P2)

As an on-call operator, I want the status result to be concise so that provider diagnostics do not consume the reasoning context with irrelevant response data.

**Why this priority**: The tool is used inside reasoning strategies, where compact observations improve signal and reduce unnecessary model context.

**Independent Test**: Return a valid response containing additional fields and verify that the tool output includes only the indicator and description on one line.

**Acceptance Scenarios**:

1. **Given** a valid status response contains metadata beyond the status fields, **When** the tool formats the result, **Then** it omits all unrelated fields.
2. **Given** the description contains line breaks or excess whitespace, **When** the result is formatted, **Then** the output remains a single compact line.

### Edge Cases

- An unsupported provider value is rejected by the input schema before a network request.
- A response has a non-2xx status other than a retryable 5xx; the tool returns a readable error without a second attempt.
- A response body is not valid JSON; the tool returns a readable error observation.
- The fake fetch verifies that each attempt receives an abort signal with a five-second timeout.
- The retry itself times out or fails; no third request is made.
- Provider descriptions are empty or whitespace-only; response validation fails clearly.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST expose a `check_provider_status` tool alongside the existing operational tools.
- **FR-002**: The tool MUST accept a `provider` parameter limited to `github` and `cloudflare`, defaulting to `github`.
- **FR-003**: The provider parameter description MUST explain that the tool is for suspected external-provider incidents, distinguishing local failures from dependency outages.
- **FR-004**: The tool MUST map `github` to `https://www.githubstatus.com/api/v2/status.json` and `cloudflare` to `https://www.cloudflarestatus.com/api/v2/status.json`.
- **FR-005**: The tool MUST apply a five-second timeout to every request attempt.
- **FR-006**: The tool MUST retry exactly once after a network failure, timeout, or HTTP 5xx response.
- **FR-007**: The tool MUST validate successful response data as an object containing `status.indicator` and `status.description` strings.
- **FR-008**: The tool MUST return a single compact line containing the validated indicator and description.
- **FR-009**: The tool MUST return a readable error string for any final network, timeout, HTTP, JSON, or validation failure.
- **FR-010**: The tool MUST NOT throw a final provider-status failure outside the tool invocation.
- **FR-011**: The fetch function MUST be injectable so tests can run without network access.
- **FR-012**: Tests MUST cover successful responses, timeout/retry behavior, and invalid response validation using fake fetch implementations.

### Key Entities

- **Provider**: Supported external dependency identifier, either `github` or `cloudflare`.
- **Provider Status Response**: Validated status payload with an indicator and human-readable description.
- **Status Check Attempt**: One timed request to a provider endpoint, including retry position and outcome.
- **Status Observation**: Compact success or readable failure string returned to the reasoning strategy.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Valid checks for both supported providers return exactly one compact output line containing only indicator and description.
- **SC-002**: A transient network, timeout, or 5xx failure results in no more than two total requests.
- **SC-003**: 100% of final failures in deterministic tests return strings and produce no uncaught tool exception.
- **SC-004**: Invalid response shapes are rejected before any response field outside the validated status object reaches the reasoning trace.
- **SC-005**: Deterministic tests cover success, timeout, retry, and invalid response paths without making a network request.
- **SC-006**: Existing tools and strategy tests remain green after the new tool is registered.

## Assumptions

- The public status endpoints use the standard Statuspage API v2 response shape.
- The tool performs read-only HTTP GET requests and requires no authentication.
- HTTP 5xx responses are retryable; other non-2xx responses are final failures.
- The default provider is GitHub for backward-compatible, low-friction invocation.
- Error strings are observations for the reasoning agent, not domain exceptions.
