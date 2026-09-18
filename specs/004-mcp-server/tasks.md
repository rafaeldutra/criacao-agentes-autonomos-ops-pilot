---
description: "Tarefas de implementação do servidor MCP do OpsPilot"
---

# Tasks: OpsPilot MCP Server

**Input**: Design documents from `/specs/004-mcp-server/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mcp-server.md, quickstart.md

**Organization**: Tasks are grouped by user story and ordered so the MCP adapter remains a thin protocol boundary over the existing tools and store.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the MCP SDK dependency and establish the source/test surfaces described by the plan.

- [X] T001 Add `@modelcontextprotocol/sdk` to `dependencies` in `package.json` and update `package-lock.json` using the project package manager
- [X] T002 [P] Create the MCP source and test entry points at `src/mcp/server.ts` and `src/mcp/server.test.ts` without introducing protocol output or duplicate operational logic

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared MCP adapter composition before implementing individual user journeys.

**⚠️ CRITICAL**: No user story work should begin until the SDK and adapter boundary are ready.

- [X] T003 Inspect the MCP SDK server, stdio transport, tool registration, and in-process transport APIs used by the installed SDK version in `src/mcp/server.ts` and `src/mcp/server.test.ts`
- [X] T004 Define a testable server factory in `src/mcp/server.ts` that accepts or creates one `OpsStore` and one `createTools` result, keeping store lifetime shared across MCP calls
- [X] T005 [P] Define the explicit three-tool registry in `src/mcp/server.ts` using `listAlertsSchema`, `openIncidentSchema`, and `resolveIncidentSchema` imported from `src/agents/tools.ts`
- [X] T006 [P] Add test helpers for an in-process MCP client/transport pair and stdout capture in `src/mcp/server.test.ts`

**Checkpoint**: The SDK dependency, server factory, explicit tool registry, and deterministic protocol harness are ready.

---

## Phase 3: User Story 1 - Discovering OpsPilot tools (Priority: P1) 🎯 MVP

**Goal**: Let an MCP client initialize against `opspilot` and discover exactly the three supported operational tools.

**Independent Test**: Connect an in-process MCP client to the server factory, initialize it, call tool discovery, and assert server identity, description, exact tool names, and absence of ordinary stdout output.

### Tests for User Story 1

- [X] T007 [P] [US1] Add an integration test for MCP initialization asserting server name `opspilot` and an alert/incident management description in `src/mcp/server.test.ts`
- [X] T008 [P] [US1] Add a discovery test asserting `tools/list` returns exactly `list_alerts`, `open_incident`, and `resolve_incident` with no extra tools in `src/mcp/server.test.ts`
- [X] T009 [US1] Add a protocol-output test asserting server startup and discovery produce no non-protocol writes to stdout in `src/mcp/server.test.ts`

### Implementation for User Story 1

- [X] T010 [US1] Instantiate the MCP server with the `opspilot` identity and on-call alert/incident description in `src/mcp/server.ts`
- [X] T011 [US1] Register only `list_alerts`, `open_incident`, and `resolve_incident` with their existing schemas and names in `src/mcp/server.ts`
- [X] T012 [US1] Implement the stdio entry point using `StdioServerTransport` in `src/mcp/server.ts` without `console.log` or ordinary stdout diagnostics

**Checkpoint**: An MCP client can initialize and discover the exact required tool surface.

---

## Phase 4: User Story 2 - Reusing operational tool contracts (Priority: P1)

**Goal**: Make MCP calls use the same Zod schemas, `OpsStore`, validation behavior, and incident lifecycle as existing OpsPilot tools.

**Independent Test**: Call all three tools through the MCP client, observe shared store state, and verify invalid input fails without mutation.

### Tests for User Story 2

- [X] T013 [P] [US2] Add a schema discovery test comparing MCP input schemas to `listAlertsSchema`, `openIncidentSchema`, and `resolveIncidentSchema` from `src/agents/tools.ts` in `src/mcp/server.test.ts`
- [X] T014 [P] [US2] Add MCP call tests for `list_alerts`, `open_incident`, and `resolve_incident`, including opening then resolving an incident in the same store, in `src/mcp/server.test.ts`
- [X] T015 [US2] Add invalid-input tests proving malformed list/open/resolve requests are rejected and do not mutate the shared store in `src/mcp/server.test.ts`

### Implementation for User Story 2

- [X] T016 [US2] Adapt the existing LangChain tool invocations or shared tool handlers to MCP text-content results while preserving `OpsStore` behavior in `src/mcp/server.ts`
- [X] T017 [US2] Translate Zod validation and domain failures into MCP tool-call errors without swallowing errors or performing partial mutations in `src/mcp/server.ts`
- [X] T018 [US2] Verify the MCP adapter does not expose unrelated tools such as `list_incidents`, `consultar_runbook`, or `check_provider_status` in `src/mcp/server.ts`

**Checkpoint**: All three MCP tools use the existing contracts and store, and invalid calls are safe.

---

## Phase 5: User Story 3 - Running the server safely from the project (Priority: P2)

**Goal**: Provide a stable package command and enforce the stdio stdout/stderr boundary.

**Independent Test**: Run the package script in a controlled process, confirm it starts the stdio server without ordinary stdout output, and verify source-level logging rules.

### Tests for User Story 3

- [X] T019 [P] [US3] Add a package-script test or manifest assertion that `npm run mcp` targets `src/mcp/server.ts` in `src/mcp/server.test.ts` or `package.json`
- [X] T020 [US3] Add a source/test assertion that MCP server code contains no `console.log` and routes any diagnostic path to stderr in `src/mcp/server.test.ts`

### Implementation for User Story 3

- [X] T021 [US3] Add the `mcp` script as `tsx src/mcp/server.ts` in `package.json` without loading `.env` unless implementation requires it
- [X] T022 [US3] Add explicit stderr diagnostics and orderly transport shutdown handling in `src/mcp/server.ts`, ensuring startup failures are not reported as successful protocol messages

**Checkpoint**: Operators can launch the MCP server with one command and stdout remains protocol-only.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete MCP feature and update its run instructions only if implementation details differ.

- [X] T023 [P] Update `specs/004-mcp-server/quickstart.md` with the final SDK/test invocation details if they differ from the planned deterministic scenarios
- [X] T024 Run `npm run typecheck`, `npm run test`, and `git diff --check`; confirm all existing agent/tool tests remain green
- [X] T025 Confirm all requirements in `specs/004-mcp-server/spec.md` and `contracts/mcp-server.md` are covered by implementation and tests, preserving unrelated worktree files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No feature dependency; add the SDK and create the MCP surfaces.
- **Foundational (Phase 2)**: Depends on T001 and T002; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on T003-T006 and delivers the MVP discovery path.
- **User Story 2 (Phase 4)**: Depends on the explicit registry from US1; tests and implementation must preserve the same store and schemas.
- **User Story 3 (Phase 5)**: Depends on the server entry point from US1 and call behavior from US2.
- **Polish (Phase 6)**: Depends on all required user stories.

### User Story Dependencies

- **US1 (P1)**: Can start after the foundational phase and is the MVP.
- **US2 (P1)**: Uses the US1 registry but is independently testable through MCP calls.
- **US3 (P2)**: Finalizes launch and logging boundaries after the server behavior exists.

### Within Each User Story

- Write tests before the corresponding implementation tasks.
- Keep the explicit registry ahead of protocol behavior and keep shared schemas ahead of adapters.
- Preserve the existing `OpsStore` and avoid parallel mutation implementations.
- Run focused MCP tests at each checkpoint before advancing.

## Parallel Opportunities

- T002 and T003 can proceed in parallel after the dependency is installed.
- T005 and T006 can proceed in parallel once the server factory boundary is known.
- T007 and T008 can be written in parallel; T009 depends on the protocol harness.
- T013 and T014 can be written in parallel; T015 can follow the shared call helper.
- T019 and T020 can be developed in parallel with the package-script implementation.

## Parallel Example: User Story 1

```text
# After Phase 2:
T007 and T008 can be drafted together.
Then implement T010 -> T011 -> T012 and run T007-T009.
```

## Parallel Example: User Story 2

```text
# After US1 discovery works:
T013 and T014 can be drafted together.
Then add T015, implement T016 -> T017 -> T018, and run all US2 tests.
```

## Implementation Strategy

1. **MVP first**: Add the SDK, create the server factory, and complete US1 discovery with exact identity/tool list.
2. **Behavior second**: Wire the three existing schemas and store operations, including validation and error translation.
3. **Operational safety third**: Add the package script, stderr diagnostics, shutdown behavior, and stdout isolation checks.
4. **Validation last**: Run typecheck, the full existing test suite, diff checks, and contract coverage review.
