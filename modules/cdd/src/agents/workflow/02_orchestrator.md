# CDD Orchestrator Protocol

Follow `00_shared_contract.md` and `01_cdd.md` first.

The main agent reads this document and assumes the orchestrator role. This is NOT a spawnable sub-agent.

## Main-session boundary

The orchestrator never edits code or tests directly. All implementation work is delegated to workers.

Command selection: use `mise run build`/`mise run check` only when the consumer has the current generated `mise.toml` and tasks; otherwise use that project's configured equivalent commands.

What the orchestrator CAN do:

- Run CLI commands (`pnpm cdd ac add/list`, `pnpm sonamu test`; for current generated projects, `mise run build` and `mise run check`)
- Run Sonamu setup commands needed to support Claim execution (`pnpm sonamu sync`, `pnpm sonamu migrate generate`, `pnpm sonamu migrate run`, `pnpm sonamu scaffold ...`)
- Delegate planning to `cdd-planner`
- Create/manage Claims (`tmp/claims/`)
- Spawn workers (Agent tool or TeamCreate)
- Update contract documents (with user confirmation only)
- Communicate with the user

## Bootstrap

Bootstrap is mandatory and must complete before any planning or implementation work. The output is `bootstrap_context`.

### Procedure

1. Read `00_shared_contract.md`, `01_cdd.md`, and this document.
2. Determine execution mode:
   - Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable.
   - Set -> team mode. Unset/empty -> sub-agent mode.
3. Identify scope from the user request:
   - Scope in: what this CDD cycle will deliver.
   - Scope out / non-goals: what is explicitly excluded.
   - Affected contract files (`contract/**/*.contract.md`).
   - Affected Rules files (`contract/rules/*.rules.json`).
   - Unresolved questions: anything that blocks planning.
4. Resolve unresolved questions with the user. Do not proceed until count is 0.
5. **If team mode**: create the team via `TeamCreate` with all five worker agents. Confirm creation succeeded.
6. Produce `bootstrap_context` and report to user.

### `bootstrap_context` schema

```yaml
bootstrap_context:
  user_request: "original request verbatim"
  scope_in:
    - "deliverable 1"
    - "deliverable 2"
  scope_out:
    - "non-goal 1"
  affected_contracts:
    - "contract/main.contract.md"
  affected_rules:
    - "contract/rules/api.rules.json"
  execution_mode: "team|sub-agent"
  unresolved_questions: [] # must be empty before proceeding
```

## 1. Planner handoff

1. Delegate planning to `cdd-planner`.
   - Team mode: assign the planning task to `cdd-planner`.
   - Sub-agent mode: spawn `cdd-planner`.
2. Provide the planner with:
   - `bootstrap_context`
   - relevant contract file contents
   - applicable Rules file contents
   - relevant code/test context
   - current AC state if available (`pnpm cdd ac list`)
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

| work kind   | worker                   | agent definition                   |
| ----------- | ------------------------ | ---------------------------------- |
| `planning`  | `cdd-planner`            | `agents/cdd-planner.md`            |
| `surface`   | `cdd-surface-scaffolder` | `agents/cdd-surface-scaffolder.md` |
| `test`      | `cdd-test-writer`        | `agents/cdd-test-writer.md`        |
| `implement` | `cdd-implementer`        | `agents/cdd-implementer.md`        |

### Sub-agent mode execution

1. Spawn `surface` Claims (those with no `depends_on`) first via `Agent` tool.
2. After surface completion, run `cdd-reviewer` with `review_scope: unit` and `stage: surface`.
3. If surface review is clean, spawn `test` + `implement` Claims in parallel via `Agent` tool.
4. Review completed test Claims with `cdd-reviewer` using `review_scope: unit` and `stage: test`.
5. Review completed implement Claims with `cdd-reviewer` using `review_scope: unit` and `stage: implement`.
6. If both stage reviews are clean, run `cdd-reviewer` once more with `review_scope: integration`.
7. Each worker edits only within `scope.write`.
8. If a worker reports needing changes outside `scope.write`, adjust the Claim and re-spawn.

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

### Stage review

1. Surface review is mandatory before test or implementation starts.
2. Test and implement reviews run after each stage completes.
3. Review scope always includes the changed files, applied Rules, and worker evidence relevant to that stage.

### Feedback loop

When a review returns `status: needs_fix`:

1. Classify each finding by severity (`high` / `medium`).
2. Group findings by owning Claim ID.
3. For each affected Claim:
   - Append findings to the Claim's `findings` field.
   - Re-spawn or reassign the owning worker with the updated Claim.
4. After fix, re-run the stage review for the affected stage only.
5. If the same finding persists after 3 fix attempts, escalate to the user.

### Integration review

After all stage reviews are clean, run `cdd-reviewer` with `review_scope: integration` across all changed files.

If integration review returns findings, apply the same feedback loop but scope fixes to the cross-cutting issue.

## 6. AC verification

1. Run `pnpm sonamu test` (or target specific test files).
2. All pass -> proceed to handoff.
3. On failure:
   - Pass failure log to the relevant owner via `findings`.
   - After fix, repeat from the relevant stage review.
4. If the same failure repeats 3 times, report to user.

## 7. Handoff

After AC verification passes and all reviews are clean:

1. Produce `handoff_bundle` per `06_handoff.md`.
2. Present to user.
3. Clean up `tmp/claims/` after user confirms.
