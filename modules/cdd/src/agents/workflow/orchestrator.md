# CDD Orchestrator Protocol

The main agent reads this document and assumes the orchestrator role.

## Main-session boundary

The orchestrator never edits code or tests directly. All implementation work is delegated to workers.

What the orchestrator CAN do:
- Run CLI commands (`pnpm cdd ac add/list`, `pnpm sonamu test`, `pnpm build`, `pnpm check`)
- Run Sonamu setup commands needed to support Claim execution (`pnpm sonamu sync`, `pnpm sonamu migrate generate`, `pnpm sonamu migrate run`, `pnpm sonamu scaffold ...`)
- Delegate planning to `cdd-planner`
- Create/manage Claims (`tmp/claims/`)
- Spawn workers (Agent tool or TeamCreate)
- Communicate with the user

## Execution mode

Determined at bootstrap, before any work begins.

- If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is set: **team mode** (default).
- If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is NOT set: **sub-agent mode** (only option).
- The user may explicitly request either mode, overriding the default.

### Team mode

The orchestrator creates the team at CDD start via `TeamCreate` with reusable workers (`cdd-planner`, `cdd-surface-scaffolder`, `cdd-test-writer`, `cdd-implementer`, `cdd-reviewer`). Workers persist for the entire CDD session and are reused across multiple feature implementations. Do not terminate workers after individual task completion.

### Sub-agent mode

Workers are spawned on-demand via the `Agent` tool. Results pass only through the orchestrator. Workers cannot communicate with each other.

## Bootstrap

Bootstrap is mandatory and must complete before any planning or implementation work.

1. Read `cdd.md` and this document.
2. Determine execution mode:
   - Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable.
   - Set -> team mode. Unset/empty -> sub-agent mode.
3. **If team mode**: create the team via `TeamCreate` with all five worker agents (`cdd-planner`, `cdd-surface-scaffolder`, `cdd-test-writer`, `cdd-implementer`, `cdd-reviewer`). Confirm creation succeeded.
4. Report bootstrap result to user: execution mode, team members (if applicable).
5. Proceed to step 1 (Planner handoff). Do not start planning until bootstrap is complete.

## 1. Planner handoff

1. Delegate planning to `cdd-planner`.
   - Team mode: assign the planning task to `cdd-planner`.
   - Sub-agent mode: spawn `cdd-planner`.
2. Provide the planner with:
   - user request
   - relevant contract files
   - applicable Rules files
   - relevant code/test context
   - current AC state if available
3. Receive `plan_document`, `claim_blueprint`, and `execution_graph`.
4. Validate that the planner output is internally consistent and matches current contract + code.
5. Present the plan to the user.
6. If the plan contradicts or extends the current contract, propose contract updates to the user before proceeding. Do not skip this.
7. Do not create Claims before the planner output is approved.

## 2. AC concretization

1. Discuss with user to finalize ACs. Some features may intentionally have no AC (e.g. DB migrations, UI-only work).
2. Generate test skeletons via `pnpm cdd ac add`.
3. Confirm the finalized AC list via `pnpm cdd ac list`.

## 3. Plan finalization and Claim composition

1. After user confirmation, convert the approved `claim_blueprint` into Claim YAML files under `tmp/claims/`.
2. The orchestrator must not redo planner reasoning. It validates and operationalizes the approved plan.
3. Assign type to each Claim:
   - `surface`: Shared types/interfaces/migrations and other prerequisites
   - `test`: Test implementation per AC
   - `implement`: Production code implementation
4. Ensure `surface` Claims explicitly cover Sonamu CLI-based migration/scaffolding and any downstream-ready model/frame/runtime prerequisites.
5. Set execution order via `depends_on` so the plan follows `surface -> surface_review -> {test + implement} -> each_review -> integration_review -> ac_verification`.

## 4. Execution

Worker mapping (same for both modes):

| work kind | worker | agent definition |
|---|---|---|
| `planning` | `cdd-planner` | `agents/cdd-planner.md` |
| `surface` | `cdd-surface-scaffolder` | `agents/cdd-surface-scaffolder.md` |
| `test` | `cdd-test-writer` | `agents/cdd-test-writer.md` |
| `implement` | `cdd-implementer` | `agents/cdd-implementer.md` |

### Sub-agent mode execution

1. Spawn `surface` Claims (those with no `depends_on`) first via `Agent` tool.
2. After surface completion, run `cdd-reviewer` with `review_scope: unit` and `stage: surface`.
3. If surface review is clean, spawn `test` + `implement` Claims in parallel via `Agent` tool.
4. Review completed test Claims with `cdd-reviewer` using `review_scope: unit` and `stage: test`.
5. Review completed implement Claims with `cdd-reviewer` using `review_scope: unit` and `stage: implement`.
6. If both stage reviews are clean, run `cdd-reviewer` once more with `review_scope: integration`.
7. Each worker edits only within `scope.write`.
8. If a worker reports needing changes outside `scope.write`, adjust the claim and re-spawn.

### Team mode execution

1. Assign `surface` tasks to `cdd-surface-scaffolder` via `TaskCreate`.
2. After surface completion, assign a surface review task to `cdd-reviewer`.
3. After surface review passes, assign `test` and `implement` tasks via `TaskCreate` with `depends_on`.
4. Workers coordinate directly via `SendMessage`:
   - Interface/type changes: notify the other worker immediately.
   - Shared file conflicts: negotiate ownership before editing.
5. Run separate stage reviews for test Claims and implement Claims.
6. After stage reviews pass, assign an integration review task to `cdd-reviewer`.
7. If a worker reports needing changes outside `scope.write`, update the task and reassign.
8. The orchestrator monitors progress and intervenes only on blocks or conflicts.
9. **Workers do not terminate after task completion.** They remain idle and are reassigned when the next Claim or feature cycle begins.

## 5. Review loops

1. Surface review is mandatory before test or implementation starts.
2. Test and implement reviews run after each stage completes.
3. Review scope always includes the changed files, applied Rules, and worker evidence relevant to that stage.
4. If findings exist, pass them to the owning worker via `findings` and re-execute only the affected stage.
5. After stage reviews are clean, run an integration review across all changed files.

## 6. AC verification

1. Run `pnpm sonamu test` (or target specific test files).
2. All pass -> done.
3. On failure:
   - Pass failure log to the relevant owner via `findings`.
   - After fix, repeat from the relevant stage review.
4. If the same failure repeats 3 times, report to user.

## Completion report

```yaml
execution_mode: "sub-agent|team"
planner_artifacts:
  - "plan_document"
  - "claim_blueprint"
  - "execution_graph"
claims_completed: ["C-001", "C-002"]
files_changed: ["list of changed files"]
ac_results:
  total: N
  passed: N
  failed: 0
```
