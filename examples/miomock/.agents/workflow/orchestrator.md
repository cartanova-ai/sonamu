# CDD Orchestrator Protocol

The main agent reads this document and assumes the orchestrator role.

## Main-session boundary

The orchestrator never edits code or tests directly. All implementation work is delegated to workers.

What the orchestrator CAN do:
- Run CLI commands (`pnpm cdd ac add/list`, `pnpm sonamu test`, `pnpm build`, `pnpm check`)
- Create/manage Claims (`tmp/claims/`)
- Spawn workers (Agent tool or TeamCreate)
- Communicate with the user

## Execution mode

Determined at bootstrap, before any work begins.

- If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set: **team mode** (default).
- If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is NOT set: **sub-agent mode** (only option).
- The user may explicitly request either mode, overriding the default.

### Team mode

The orchestrator creates a team at bootstrap via `TeamCreate` with all workers (`cdd-surface-scaffolder`, `cdd-test-writer`, `cdd-implementer`, `cdd-reviewer`). The team persists for the entire run. Workers can communicate directly via `SendMessage` and share a task list.

### Sub-agent mode

Workers are spawned on-demand via the `Agent` tool. Results pass only through the orchestrator. Workers cannot communicate with each other.

## Bootstrap

1. Determine execution mode (see above).
2. If team mode: create the team via `TeamCreate` with all worker agents.
3. Read `cdd.md` and this document.
4. Proceed to step 1 (Planning).

## 1. Planning

1. Understand the user's request.
2. Read relevant business logic docs (`contract/{domain}/logic.md`).
3. Read relevant existing code.
4. Read applicable Rules files (`contract/rules/`).
5. Draft implementation plan -> present to user.

## 2. AC concretization

1. Discuss with user to finalize ACs.
2. Generate test skeletons via `pnpm cdd ac add`.
3. Confirm the finalized AC list via `pnpm cdd ac list`.

## 3. Plan finalization and Claim composition

1. After user confirmation, decompose work into Claims.
2. Assign type to each Claim:
   - `surface`: Shared types/interfaces/migrations and other prerequisites
   - `test`: Test implementation per AC
   - `implement`: Production code implementation
3. Generate Claim YAMLs in `tmp/claims/`.
4. Set execution order via `depends_on`.

## 4. Execution

Worker mapping (same for both modes):

| type | worker | agent definition |
|---|---|---|
| `surface` | `cdd-surface-scaffolder` | `agents/cdd-surface-scaffolder.md` |
| `test` | `cdd-test-writer` | `agents/cdd-test-writer.md` |
| `implement` | `cdd-implementer` | `agents/cdd-implementer.md` |

### Sub-agent mode execution

1. Spawn `surface` Claims (those with no `depends_on`) first via `Agent` tool.
2. After surface completion, spawn `test` + `implement` Claims in parallel via `Agent` tool.
3. Each worker edits only within `scope.write`.
4. If a worker reports needing changes outside `scope.write`, adjust the claim and re-spawn.

### Team mode execution

1. Assign `surface` tasks to `cdd-surface-scaffolder` via `TaskCreate`.
2. After surface completion, assign `test` and `implement` tasks via `TaskCreate` with `depends_on`.
3. Workers coordinate directly via `SendMessage`:
   - Interface/type changes: notify the other worker immediately.
   - Shared file conflicts: negotiate ownership before editing.
4. If a worker reports needing changes outside `scope.write`, update the task and reassign.
5. The orchestrator monitors progress and intervenes only on blocks or conflicts.

## 5. Review

1. After all implementation Claims complete, run review:
   - Team mode: assign review task to `cdd-reviewer` via `TaskCreate`.
   - Sub-agent mode: spawn `cdd-reviewer` via `Agent` tool.
2. Review scope: all changed files + applied Rules.
3. If findings exist, pass them to the owning worker via `findings` and re-execute.

## 6. AC verification

1. Run `pnpm sonamu test` (or target specific test files).
2. All pass -> done.
3. On failure:
   - Pass failure log to the relevant `implement` worker via `findings`.
   - After fix, repeat from step 5 (review).
4. If the same failure repeats 3 times, report to user.

## Completion report

```yaml
execution_mode: "sub-agent|team"
claims_completed: ["C-001", "C-002"]
files_changed: ["list of changed files"]
ac_results:
  total: N
  passed: N
  failed: 0
```
