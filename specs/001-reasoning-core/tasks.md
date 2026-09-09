---

description: "Task list for implementing the OpsPilot reasoning core"
---

# Tasks: Núcleo de raciocínio do OpsPilot

**Input**: Design documents from `/specs/001-reasoning-core/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the source layout and executable project entry points.

- [X] T001 Create the planned directories `src/agents/`, `scripts/`, and `specs/001-reasoning-core/contracts/` without adding application logic
- [X] T002 [P] Add the `arena` execution entry point placeholder in `src/arena.ts` and preserve the existing `src/index.ts` entry point
- [X] T003 [P] Add the seed command entry point placeholder in `scripts/seed.ts` and document its invocation in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared contracts, deterministic state, validation, and model configuration required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Define the shared `ReasoningStrategy`, `ReasoningInput`, `ReasoningOptions`, `ReasoningResult`, `TraceEvent`, `Metrics`, and `PlanStep` types in `src/agents/types.ts`
- [X] T005 [P] Implement pure trace event constructors and deterministic formatting in `src/agents/trace.ts`
- [X] T006 [P] Implement the in-memory Service, Alert, and Incident store with resettable seed state and domain errors in `src/agents/store.ts`
- [X] T007 [P] Define Zod schemas for alert status, severity, tool arguments, iteration limits, and structured plan steps in `src/agents/tools.ts`
- [X] T008 Implement the single OpenRouter model factory in `src/agents/model.ts`, reading `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`, using the OpenRouter base URL and temperature `0`, with explicit missing-configuration errors
- [X] T009 Add deterministic store tests covering the five-service/six-alert seed, status counts, incident lifecycle, invalid inputs, and reset behavior in `src/agents/store.test.ts`
- [X] T010 Add deterministic trace formatting tests covering every event type and action tool arguments in `src/agents/trace.test.ts`

**Checkpoint**: Shared types, state, validation, model factory, and deterministic tests are ready for strategy implementation.

---

## Phase 3: User Story 1 - Executar uma estratégia de raciocínio (Priority: P1) 🎯 MVP

**Goal**: Provide a common strategy result with complete typed traces, metrics, model-call counting, and iteration limits.

**Independent Test**: Run a strategy with a controlled model/tool adapter and verify `answer`, ordered typed `trace`, `llmCalls`, `latencyMs`, and termination at `maxIterations`.

### Tests for User Story 1

- [X] T011 [P] [US1] Add contract tests for the common strategy result and trace invariants in `src/agents/strategy.test.ts`
- [X] T012 [P] [US1] Add deterministic tests for iteration-limit and model-call accounting helpers in `src/agents/metrics.test.ts`

### Implementation for User Story 1

- [X] T013 [US1] Implement the shared execution options, latency measurement, and model-call counter helpers in `src/agents/strategy.ts`
- [X] T014 [US1] Implement the LangGraph ReAct strategy using the pre-built ReAct agent and the registered tools in `src/agents/react.ts`
- [X] T015 [US1] Capture ReAct thoughts, actions, observations, critiques, and answer messages as the shared trace format in `src/agents/react.ts`
- [X] T016 [US1] Enforce `maxIterations` and return controlled termination with accurate metrics from `src/agents/react.ts`
- [X] T017 [US1] Implement the Plan-and-Execute graph state, structured planner output, one-step executor, and replanner in `src/agents/plan-and-execute.ts`
- [X] T018 [US1] Enforce the eight-step plan cap, iteration limit, termination when no steps remain, and LLM-call accounting in `src/agents/plan-and-execute.ts`
- [X] T019 [US1] Add deterministic strategy tests using injected model/tool doubles without OpenRouter network access in `src/agents/strategies.test.ts`

**Checkpoint**: ReAct and Plan-and-Execute both satisfy the common strategy contract and can be tested without network access.

---

## Phase 4: User Story 2 - Consultar e alterar o estado operacional (Priority: P1)

**Goal**: Expose validated alert and incident tools over the deterministic seeded store and provide a repeatable seed command.

**Independent Test**: Reset the store, list all alerts and each status, open an incident, resolve it, and rerun the seed without duplicates.

### Tests for User Story 2

- [X] T020 [P] [US2] Add deterministic tool contract tests for `list_alerts`, `open_incident`, and `resolve_incident` in `src/agents/tools.test.ts`
- [X] T021 [P] [US2] Add seed idempotency and output tests for the primary dataset in `scripts/seed.test.ts`

### Implementation for User Story 2

- [X] T022 [US2] Implement `list_alerts(status)`, `open_incident(title, service, severity)`, and `resolve_incident(id)` as validated tools backed by the store in `src/agents/tools.ts`
- [X] T023 [US2] Implement the primary seed dataset with five services and six alerts, including three `firing` and three `resolved`, in `scripts/seed.ts`
- [X] T024 [US2] Make `scripts/seed.ts` reset and repopulate the in-memory store without duplicate records, and print a concise seed summary
- [X] T025 [US2] Load the local JSON database from `data/seed.json` in `src/agents/store.ts` without coupling deterministic tests to an external database

**Checkpoint**: The store, tools, and seed can be exercised independently and all invalid mutations fail before state changes.

---

## Phase 5: User Story 3 - Comparar estratégias na arena (Priority: P2)

**Goal**: Run one or more registered strategies over the same input and print separate answers, traces, and metrics with CLI limits.

**Independent Test**: Run the arena with one strategy and then both strategies using `--strategies` and `--max-iterations`, verifying selection, shared input, output sections, and invalid-flag errors.

### Tests for User Story 3

- [X] T026 [P] [US3] Add pure CLI argument parsing tests for `--strategies` and `--max-iterations` in `src/arena.test.ts`
- [X] T027 [P] [US3] Add arena output tests using deterministic strategy doubles in `src/arena.test.ts`

### Implementation for User Story 3

- [X] T028 [US3] Implement pure arena flag parsing, strategy selection, input handling, and invalid-argument errors in `src/arena.ts`
- [X] T029 [US3] Implement arena execution over one shared input with separate formatted answer, trace, and metrics sections per strategy in `src/arena.ts`
- [X] T030 [US3] Register ReAct and Plan-and-Execute strategies behind stable names and wire the `npm run arena` command to `src/arena.ts` in `package.json`

**Checkpoint**: The arena compares selected strategies independently while preserving the common output contract.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature, documentation, and required seed execution.

- [X] T031 [P] Update `specs/001-reasoning-core/quickstart.md` with the final commands, strategy names, and observed seed output
- [X] T032 [P] Review public exports and error messages across `src/agents/` for strict TypeScript ESM and MVC consistency
- [X] T033 Run `npm run typecheck` and fix all type errors without weakening strict compiler settings
- [X] T034 Run `npm run test` and fix all deterministic test failures without adding network dependencies
- [X] T035 Execute `npm run seed` and verify the output reports five services and six alerts with three `firing` and three `resolved`
- [X] T036 Validate arena argument parsing and deterministic output paths without network access; live OpenRouter execution remains credential-dependent

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001–T003 can start immediately.
- **Foundational (Phase 2)**: Depends on T001; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on T004–T008; T011–T012 should be written before T013–T018.
- **User Story 2 (Phase 4)**: Depends on T006–T007; can proceed in parallel with User Story 1 after foundational work.
- **User Story 3 (Phase 5)**: Depends on T004, T005, and the strategy implementations T014–T018; can proceed after User Story 1.
- **Polish (Phase 6)**: Depends on all desired user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational only; delivers the MVP strategy contract and both strategy implementations.
- **User Story 2 (P1)**: Depends on Foundational only; independently validates tools and seeded state, while supplying dependencies used by strategies.
- **User Story 3 (P2)**: Depends on User Story 1 for registered strategies and on Foundational for trace formatting.

### Within Each User Story

- Tests are written before their corresponding implementation.
- Types and models precede services and strategies.
- Store and tool services precede strategy integration.
- Core strategy execution precedes arena integration.
- Complete the story checkpoint before starting dependent work.

### Parallel Opportunities

- T002 and T003 can run in parallel after T001.
- T005, T006, and T007 can run in parallel after T004.
- T009 and T010 can run in parallel after T006/T005 respectively.
- T011, T012, T020, and T021 can be prepared in parallel once their foundational contracts exist.
- After Phase 2, User Stories 1 and 2 can be developed in parallel.
- T026 and T027 can run in parallel after the arena boundary is defined.
- T031 and T032 can run in parallel before the final validation commands.

## Parallel Example: User Story 1

```text
Task: "Add common strategy contract tests in src/agents/strategy.test.ts"
Task: "Add metrics and iteration-limit tests in src/agents/metrics.test.ts"
Task: "Implement ReAct strategy in src/agents/react.ts"
Task: "Implement Plan-and-Execute graph in src/agents/plan-and-execute.ts"
```

## Parallel Example: User Story 2

```text
Task: "Add deterministic tool tests in src/agents/tools.test.ts"
Task: "Add seed idempotency tests in scripts/seed.test.ts"
Task: "Implement primary seed dataset in scripts/seed.ts"
```

## Implementation Strategy

### MVP First (User Story 1 + required foundation)

1. Complete Phase 1 and Phase 2.
2. Complete User Story 1 with deterministic model/tool doubles.
3. Stop and validate the common contract, traces, metrics, and iteration limits.
4. Add User Story 2 to make the tools and seeded operational state usable.

### Incremental Delivery

1. Foundation ready: shared types, trace, store, schemas, model factory.
2. User Story 1: ReAct and Plan-and-Execute independently executable.
3. User Story 2: tools, seed, and persistence adapter boundary.
4. User Story 3: arena comparison and CLI flags.
5. Polish: typecheck, deterministic tests, seed execution, and quickstart validation.

### Final Validation

The implementation is complete only when `npm run typecheck`, `npm run test`, and the seed command succeed, and the arena path is validated according to available OpenRouter credentials.

## Notes

- `[P]` tasks touch different files and have no dependency on incomplete work.
- `[US1]`, `[US2]`, and `[US3]` map tasks to the prioritized stories in `spec.md`.
- Every task includes a concrete repository path.
- Do not read `.env` directly in scripts or tests; configure live credentials through the runtime environment.
