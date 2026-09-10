# Tasks: Reflection Layer

**Input**: Design documents from `/specs/002-reflection-layer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Deterministic tests are required by the feature specification and constitution.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the existing project structure is ready for the opt-in reflection decorator.

- [X] T001 Verify the active feature artifacts and existing strategy contract in `specs/002-reflection-layer/` and `src/agents/types.ts`
- [X] T002 [P] Verify the test command and TypeScript configuration support new ESM tests in `package.json` and `tsconfig.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared types and trace helpers required by all reflection stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Extend reflection option and critic result types in `src/agents/types.ts` without breaking `ReasoningStrategy`
- [X] T004 Add pure metric and trace composition helpers for reflection attempts in `src/agents/trace.ts` and `src/agents/strategy.ts`
- [X] T005 [P] Add deterministic critique event formatting coverage in `src/agents/trace.test.ts`

**Checkpoint**: Shared reflection contracts and composition helpers are ready.

---

## Phase 3: User Story 1 - Validating a strategy answer (Priority: P1) 🎯 MVP

**Goal**: Review a base strategy result against its observations, append a typed critique event, and stop immediately when approved.

**Independent Test**: A deterministic critic approves the first result; the decorated strategy returns the original answer, exactly one critique event, and additive critic metrics.

### Tests for User Story 1

- [X] T006 [P] [US1] Add approval-path decorator test with a deterministic strategy and critic in `src/agents/reflection.test.ts`
- [X] T007 [P] [US1] Add observation-context and immutable-trace test for critique evaluation in `src/agents/reflection.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Implement validated critic input/output schemas and option defaults in `src/agents/reflection.ts`
- [X] T009 [US1] Implement `withReflection(strategy, options?)` initial execution, structured critique invocation, approval stop, critique trace event, and additive metrics in `src/agents/reflection.ts`
- [X] T010 [US1] Expose the same-model critic factory seam without reading environment variables outside `src/agents/model.ts` in `src/agents/reflection.ts`

**Checkpoint**: An approved first critique produces a complete reflected result without regeneration.

---

## Phase 4: User Story 2 - Regenerating with feedback (Priority: P1)

**Goal**: Regenerate rejected answers with feedback and stop at approval or the configured reflection limit.

**Independent Test**: A deterministic critic rejects the first answer and approves the second; the second execution receives feedback, both critiques remain in order, and metrics include all calls.

### Tests for User Story 2

- [X] T011 [P] [US2] Add rejected-then-approved regeneration test asserting feedback context and final answer in `src/agents/reflection.test.ts`
- [X] T012 [P] [US2] Add max-reflections rejection test asserting default and custom limits in `src/agents/reflection.test.ts`
- [X] T013 [P] [US2] Add malformed critic output, empty feedback, and explicit error tests in `src/agents/reflection.test.ts`

### Implementation for User Story 2

- [X] T014 [US2] Implement regeneration context envelope containing original input, current answer, observations, reflection index, and feedback in `src/agents/reflection.ts`
- [X] T015 [US2] Implement retry loop, last-answer fallback, and strict `maxReflections` validation in `src/agents/reflection.ts`
- [X] T016 [US2] Compose regenerated traces and additive `llmCalls`/latency metrics without mutating prior results in `src/agents/reflection.ts`

**Checkpoint**: Rejected answers regenerate correctly and never exceed the configured reflection count.

---

## Phase 5: User Story 3 - Selecting reflection from the Arena (Priority: P2)

**Goal**: Select reflected ReAct and Plan-and-Execute strategies through stable Arena aliases while preserving existing names.

**Independent Test**: The Arena parser and registry resolve `reflect:react` and `reflect:plan-and-execute`, while `react` and `plan-and-execute` remain non-reflected.

### Tests for User Story 3

- [X] T017 [P] [US3] Add parser coverage for both reflection aliases and unknown alias errors in `src/arena.test.ts`
- [X] T018 [P] [US3] Add registry-selection coverage using injected deterministic strategies in `src/arena.test.ts`

### Implementation for User Story 3

- [X] T019 [US3] Extend Arena strategy name validation and positional argument parsing for `reflect:react` and `reflect:plan-and-execute` in `src/arena.ts`
- [X] T020 [US3] Build reflected strategy registry entries by decorating ReAct and Plan-and-Execute with the same configured model in `src/arena.ts`
- [X] T021 [US3] Preserve selected alias headings and complete reflected trace/metrics output in `src/arena.ts`

**Checkpoint**: Both reflection aliases run independently and existing Arena strategies remain behavior-compatible.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature and keep documentation aligned.

- [X] T022 [P] Update reflection usage and alias examples in `specs/002-reflection-layer/quickstart.md`
- [X] T023 Run `npm run typecheck` and resolve reflection type errors in `src/agents/` and `src/arena.ts`
- [X] T024 Run `npm run test` and verify all deterministic reflection and regression tests pass
- [X] T025 Run the quickstart validation scenarios and record any implementation deviations in `specs/002-reflection-layer/quickstart.md`
- [X] T026 Review the final diff for secret exposure and confirm reflection remains opt-in in `src/agents/reflection.ts` and `src/arena.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; delivers the MVP approval path.
- **User Story 2 (Phase 4)**: Depends on the `withReflection` implementation from US1; extends it with retries and limits.
- **User Story 3 (Phase 5)**: Depends on the completed decorator from US1/US2 and integrates it with the Arena.
- **Polish (Phase 6)**: Depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 2; no dependency on another story.
- **US2 (P1)**: Depends on US1's decorator and critic seam.
- **US3 (P2)**: Depends on US2's completed retry/metrics behavior.

### Parallel Opportunities

- T002 and T005 can run in parallel after their prerequisites are inspected.
- T006 and T007 can be authored in parallel, then precede T008-T010.
- T011, T012, and T013 can be authored in parallel, then precede T014-T016.
- T017 and T018 can be authored in parallel, then precede T019-T021.
- T022 and T026 can run in parallel with the final validation tasks once implementation is complete.

---

## Parallel Example: User Story 1

```text
Task: "Add approval-path decorator test in src/agents/reflection.test.ts"
Task: "Add observation-context and immutable-trace test in src/agents/reflection.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "Add rejected-then-approved regeneration test in src/agents/reflection.test.ts"
Task: "Add max-reflections rejection test in src/agents/reflection.test.ts"
Task: "Add malformed critic output and error tests in src/agents/reflection.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "Add reflection alias parser tests in src/arena.test.ts"
Task: "Add reflected registry selection tests in src/arena.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1.
4. Run `npm run typecheck` and `npm run test`.
5. Validate that an approved first critique stops after one review.

### Incremental Delivery

1. Add US2 retry and limit behavior with deterministic tests.
2. Add US3 Arena aliases and registry integration.
3. Run the full quickstart and regression validation.
4. Keep reflection opt-in until all acceptance scenarios pass.
