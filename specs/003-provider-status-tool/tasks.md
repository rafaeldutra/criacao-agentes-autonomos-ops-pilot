---
description: "Tarefas de implementação da tool de status de provedores externos"
---

# Tasks: External Provider Status Tool

**Input**: Design documents from `/specs/003-provider-status-tool/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/provider-status.md, quickstart.md

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently after the shared foundation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing tool and test surfaces before adding the provider-status capability.

- [X] T001 Inspect the existing tool registry and deterministic test harness in `src/agents/tools.ts` and `src/agents/tools.test.ts` to preserve current exports and tool conventions

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared provider-status contracts and transport seam required by all user stories.

**⚠️ CRITICAL**: No user story implementation should begin until this phase is complete.

- [X] T002 Define the provider endpoint map, provider-status Zod response schema, injectable fetch type, and shared error/response types in `src/agents/tools.ts`
- [X] T003 [P] Add focused fake-fetch test helpers that record requested URLs and abort signals without making network calls in `src/agents/tools.test.ts`

**Checkpoint**: Shared contracts and a network-free test seam are ready for story implementation.

---

## Phase 3: User Story 1 - Checking an external dependency (Priority: P1) 🎯 MVP

**Goal**: Let an on-call operator check GitHub or Cloudflare, with GitHub selected by default, and receive a useful provider-status observation.

**Independent Test**: Invoke the exported tool with fake fetch responses for the default provider and both explicit providers; verify endpoint selection, validated status fields, and the diagnostic input description.

### Tests for User Story 1

- [X] T004 [US1] Add fake-fetch tests for the default GitHub provider and explicit Cloudflare provider, including exact endpoint selection, in `src/agents/tools.test.ts`
- [X] T005 [US1] Add schema/tool metadata assertions for the `provider` enum, GitHub default, and external-incident diagnostic description in `src/agents/tools.test.ts`

### Implementation for User Story 1

- [X] T006 [US1] Implement the `check_provider_status` input schema and provider endpoint selection in `src/agents/tools.ts`
- [X] T007 [US1] Register `check_provider_status` alongside the existing operational tools and perform a read-only GET using the injected fetch in `src/agents/tools.ts`
- [X] T008 [US1] Validate successful provider payloads with Zod and return the provider indicator and description from `src/agents/tools.ts`

**Checkpoint**: A valid default or explicit provider check works independently and existing tools remain available.

---

## Phase 4: User Story 2 - Handling unreliable status pages (Priority: P1)

**Goal**: Retry transient failures once and convert every final provider failure into a readable observation without throwing outside the tool.

**Independent Test**: Use fake fetch implementations that fail with network errors, abort timeouts, HTTP 5xx, non-retryable HTTP errors, invalid JSON, and invalid schemas; verify the exact request count and returned string.

### Tests for User Story 2

- [X] T009 [P] [US2] Add fake-fetch tests for network, timeout, and HTTP 5xx failures followed by a successful second attempt, including the five-second abort signal contract, in `src/agents/tools.test.ts`
- [X] T010 [P] [US2] Add fake-fetch tests for exhausted retries, non-retryable HTTP responses, invalid JSON, and invalid Zod payloads returning readable strings without uncaught exceptions in `src/agents/tools.test.ts`

### Implementation for User Story 2

- [X] T011 [US2] Implement per-attempt `AbortSignal.timeout(5000)` handling and the bounded one-retry loop for network errors, abort timeouts, and HTTP 5xx responses in `src/agents/tools.ts`
- [X] T012 [US2] Implement HTTP, JSON, timeout, network, and validation failure formatting as single-line tool observations without rethrowing final provider failures in `src/agents/tools.ts`

**Checkpoint**: Transient failures make at most two requests and all final failures remain usable observations.

---

## Phase 5: User Story 3 - Keeping reasoning context compact (Priority: P2)

**Goal**: Keep successful and failed provider observations concise and safe for insertion into a reasoning trace.

**Independent Test**: Return valid payloads with extra metadata and multiline/whitespace-heavy descriptions; verify a single line containing only the provider indicator and normalized description.

### Tests for User Story 3

- [X] T013 [US3] Add tests for omission of unrelated response fields and normalization of multiline or excess whitespace in successful compact output in `src/agents/tools.test.ts`

### Implementation for User Story 3

- [X] T014 [US3] Implement compact one-line success and failure formatting that retains only validated indicator/description content in `src/agents/tools.ts`

**Checkpoint**: Provider observations do not inflate the reasoning context and remain one line.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the complete feature without changing unrelated behavior.

- [X] T015 [P] Update the provider-status usage and deterministic validation notes in `specs/003-provider-status-tool/quickstart.md` if implementation details or exported test seams differ from the plan
- [X] T016 Run `npm run typecheck` and `npm run test`, then inspect `git diff --check` to confirm the feature and existing tools remain green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No implementation dependency; confirms the existing surfaces.
- **Foundational (Phase 2)**: Depends on T001 and blocks all user-story work.
- **User Story 1 (Phase 3)**: Depends on T002 and T003.
- **User Story 2 (Phase 4)**: Depends on the US1 tool/schema surface and T003; T009/T010 should be written before T011/T012.
- **User Story 3 (Phase 5)**: Depends on the successful result path from US1 and failure formatter from US2.
- **Polish (Phase 6)**: Depends on all required stories.

### User Story Dependencies

- **US1 (P1)**: Can start after the foundational phase; delivers the MVP.
- **US2 (P1)**: Builds on the US1 request and validation path, while remaining independently testable with fake fetch.
- **US3 (P2)**: Builds on the success/error result formatting from US1 and US2.

### Within Each User Story

- Write the story tests before its implementation tasks.
- Keep endpoint selection and schema validation ahead of retry/error behavior.
- Keep the tool registration stable while adding behavior incrementally.
- Run the story's focused tests before advancing to the next story.

## Parallel Opportunities

- T003 can run in parallel with the review in T001 once the existing test conventions are understood.
- T009 and T010 can be written in parallel because they cover independent failure groups in the same test surface; merge them before implementation.
- T015 can be prepared in parallel with final implementation review.
- Different user stories should not modify the same implementation lines concurrently; their tests may be drafted in parallel, but implementation is ordered by dependency.

## Parallel Example: User Story 1

```text
# After Phase 2:
T004 and T005 can be drafted together in src/agents/tools.test.ts.
Then execute T006 -> T007 -> T008 and run the US1 tests.
```

## Parallel Example: User Story 2

```text
# After US1 request and schema behavior exists:
T009 and T010 can be drafted together.
Then execute T011 -> T012 and run the retry/error tests.
```

## Implementation Strategy

1. **MVP first**: Complete the shared foundation and US1 so the agent can query both supported providers with the default behavior.
2. **Reliability second**: Add bounded retry and readable failure observations for incident-time network conditions.
3. **Context optimization third**: Normalize all output to compact single-line observations.
4. **Validation last**: Run the full existing typecheck and test commands, preserving unrelated worktree changes such as `data/example.ts`.
