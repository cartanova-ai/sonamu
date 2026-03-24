# CDD Orchestrator Protocol

Protocol for the main agent when assuming the CDD orchestrator role.

## CRITICAL: Main-session boundary

**All Phase work must be executed by spawned leaf workers.** The orchestrator directly editing Specs, writing code, writing tests, or doing Phase-scoped validation/fix work in the main session is prohibited.

The orchestrator may only:
- execute CLI commands such as `cdd status`, `cdd spec create`, and `cdd advance`
- inspect worker results and route follow-up work
- spawn leaf workers
- communicate with the user

The only direct artifact mutation allowed to the orchestrator is **Phase 1 scaffold creation** via `cdd spec create`.

## Prerequisites

1. Read `00_cdd_contract.md`.
2. Read `./cdd.md`.
3. Inspect `contract/rules/`, resolve the applicable rule files for the current task, and read them before phase routing.
4. Identify runtime spawn mode for each worker:
   - `preset`: native preset sub-agent support is available
   - `inline_fallback`: otherwise
5. Check the target Contract/Spec and current status with `cdd status <spec>` or by inspecting `contract/`.

## Phase routing

- No Contract exists: Phase 0 -> spawn `cdd-contract-writer`
  - This worker returns a review-ready Contract draft or clarification questions
  - Default `objective_packet.user_review=true`
- Contract exists but no Spec exists: Phase 1 -> orchestrator runs `cdd spec create` scaffold only, then continues with the new `draft` Spec
- Spec status is `draft` or `specifying`: Phase 2 -> spawn `cdd-specifier`
  - This worker owns `summary`, `description`, `acceptanceCriteria`, schema-defined fields, planned `sources`, and the normal specifying transition loop
  - Default `objective_packet.user_review=true`
- Any Spec status when feature-change work or implementation/test/validation follow-up requires Spec-content updates: Phase 2 follow-up -> spawn `cdd-specifier` in artifact-reconciliation mode
  - This worker preserves the current `status`, reconciles the target Spec and related Specs against live `sources`, `contracts`, and `dependsOnSpecs`, and returns `artifact_reconciliation_complete=true`
- Spec status is `implementing`: Phase 3 -> optionally spawn `cdd-surface-scaffolder`, then spawn `cdd-test-writer` and `cdd-implementer` in parallel
  - `cdd-surface-scaffolder` owns shared type/interface/export/runtime scaffolds required so planned imports resolve before the parallel pair begins
  - `cdd-test-writer` owns tests, test support files, and `acceptanceCriteria[].testRef`
  - `cdd-implementer` owns production code, implementation support files, and the final `sources` list
  - The orchestrator decides whether scaffold work is needed, fans in the parallel outputs, runs `cdd advance <spec>` on the integrated state, and re-routes findings by ownership
  - Default `objective_packet.user_review=false` for all Phase 3 workers
- Spec status is `validating`: Phase 4 -> spawn `cdd-validator`
  - This worker owns validating-stage code/test fixes and the final `validating -> done` pre-commit verification
  - Default `objective_packet.user_review=false`
- Spec status is `done`: complete and report to the user only when no change request or artifact-reconciliation follow-up remains

## Orchestration flow

```
1. Identify target
   - User specified a spec -> use that spec
   - User described a feature -> inspect contract/ and resolve the matching Contract + Spec
   - User asked how to change an existing feature -> resolve the matching Spec first, then inspect whether that Spec needs edits or added content before routing follow-up work

2. Resolve the applicable rule files
   - Inspect `contract/rules/` from the active Contract root and select the applicable `*.rules.json` files for the current task
   - Read those files before spawning any worker
   - If the task is governed but no applicable rule file can be resolved, or if a referenced file is malformed, stop and report the configuration gap instead of continuing

3. Resolve artifact state
   - No Contract -> spawn Phase 0
   - Contract exists but Spec is missing -> run Phase 1 scaffold creation, then continue

4. Select the next worker from the current Spec status and any outstanding reconciliation findings
   - draft/specifying -> Phase 2 specifier
   - implementing -> Phase 3 optional scaffold + parallel pair (`cdd-surface-scaffolder`, then `cdd-test-writer` + `cdd-implementer`)
   - validating -> Phase 4 validator
   - any status with required Spec-content follow-up -> Phase 2 specifier in artifact-reconciliation mode

5. Spawn the worker or worker pair with a complete phase packet, including `rules_paths`

6. Inspect the worker result
   - blocked -> re-route or ask the user
   - ready_for_transition=true from `cdd-contract-writer` -> close review, then return to step 3 to resolve artifact state again
   - ready_for_transition=true from a Spec-phase owner -> continue
   - artifact_reconciliation_complete=true from `cdd-specifier` -> resume the current phase owner or close the request if no further work remains
   - ready_for_parallel_pair=true from `cdd-surface-scaffolder` -> spawn the implementing pair
   - ready_for_fan_in=true from both implementing workers -> run integrated `cdd advance <spec>`
   - impacted_spec_followups or related_spec_followups -> route the follow-up Spec work before closing the overall request

7. If `objective_packet.user_review=true`, ask the user to review before phase closure

8. If the current phase is a Spec transition, execute `cdd advance <spec> --commit`

9. If the status is still below done, return to step 3 or step 4 as appropriate
```

Contract-phase follow-up routing:
- When `cdd-contract-writer` reports `impacted_spec_followups`, inspect each follow-up and spawn `cdd-specifier` for every impacted Spec that needs updates.
- The orchestrator may coordinate follow-up routing, but must not edit the impacted Specs directly.

Spec-phase follow-up routing:
- Require `cdd-specifier` to review the target Spec's `contracts` and `dependsOnSpecs`.
- If `cdd-specifier` reports `related_spec_followups`, keep routing those related Spec updates through `cdd-specifier` scope until consistency is restored.
- If `cdd-specifier` reports `contract_drift`, stop and ask the user whether a Contract edit is explicitly requested.

Feature-change follow-up routing:
- When the user asks to change an existing feature, resolve the current feature Spec before selecting a worker.
- Require `cdd-specifier` to decide whether the target Spec needs modification, additional content, or no Spec change.
- After the target Spec review, run the same related-artifact checks against `contracts` and `dependsOnSpecs` before closing the request.
- If the requested feature change implies Contract drift, stop and ask the user whether Contract edits are explicitly requested.

Implementation-change follow-up routing:
- When the user asks to modify existing behavior, or when implementing/test/validating work changes confirmed behavior, interface, constraints, error handling, data shape, or file layout, run artifact reconciliation before closure.
- Require the detecting worker to inspect the current `sources`, `contracts`, and `dependsOnSpecs`, then report whether the target Spec or related Specs need updates.
- If target-Spec or related-Spec updates are needed, spawn `cdd-specifier` in artifact-reconciliation mode before closing the request or committing the phase.
- After `cdd-specifier` completes later-phase reconciliation, resume the current phase owner for another verification pass unless the request is already complete.
- If the reconciliation reports Contract drift, stop and ask the user whether Contract edits are explicitly requested.

## Spawn mode

### Preset mode

Use the preset file under `.agents/agents/`.

| Phase | role_id | Preset file | Model |
|---|---|---|---|
| 0. contract | `cdd-contract-writer` | `agents/cdd-contract-writer.md` | opus |
| 2. specifying | `cdd-specifier` | `agents/cdd-specifier.md` | opus |
| 3A. implementing-surface | `cdd-surface-scaffolder` | `agents/cdd-surface-scaffolder.md` | opus |
| 3B. implementing-tests | `cdd-test-writer` | `agents/cdd-test-writer.md` | opus |
| 3C. implementing-code | `cdd-implementer` | `agents/cdd-implementer.md` | opus |
| 4. validating | `cdd-validator` | `agents/cdd-validator.md` | sonnet |

### Inline fallback mode

If preset sub-agents are unavailable, still spawn a leaf worker. Direct execution in the main session is **not** a fallback mode.

For inline fallback, pass:
- `role_id`
- `role_file_ref`
- `prompt_file_ref`
- `objective_packet`
- `rules_paths`
- `required_tools`
- `required_skills`
- `done_criteria`
- `execution_mode=inline_fallback`

Recommended file references:

| role_id | role_file_ref | prompt_file_ref |
|---|---|---|
| `cdd-contract-writer` | `examples/miomock/.agents/agents/cdd-contract-writer.md` | `examples/miomock/.agents/workflow/phases/00_contract.md` |
| `cdd-specifier` | `examples/miomock/.agents/agents/cdd-specifier.md` | `examples/miomock/.agents/workflow/phases/02_specify.md` |
| `cdd-surface-scaffolder` | `examples/miomock/.agents/agents/cdd-surface-scaffolder.md` | `examples/miomock/.agents/workflow/phases/03_surface.md` |
| `cdd-test-writer` | `examples/miomock/.agents/agents/cdd-test-writer.md` | `examples/miomock/.agents/workflow/phases/03_test.md` |
| `cdd-implementer` | `examples/miomock/.agents/agents/cdd-implementer.md` | `examples/miomock/.agents/workflow/phases/03_implement.md` |
| `cdd-validator` | `examples/miomock/.agents/agents/cdd-validator.md` | `examples/miomock/.agents/workflow/phases/04_validate.md` |

## Default `user_review` mapping

| role_id | default `objective_packet.user_review` |
|---|---|
| `cdd-contract-writer` | `true` |
| `cdd-specifier` | `true` |
| `cdd-surface-scaffolder` | `false` |
| `cdd-test-writer` | `false` |
| `cdd-implementer` | `false` |
| `cdd-validator` | `false` |

## Required phase packet

Every spawn must include a complete phase packet.

```yaml
execution_mode: preset|inline_fallback
role_id: cdd-specifier
parallel_group: "{optional shared transition id for parallel phases}"
objective_packet:
  global_objective: "Complete the target feature through the CDD workflow"
  phase_objective: "Bring the Spec from draft/specifying to implementing-ready"
  unit_objective: "Own only the assigned phase scope"
  user_review: true
  non_goals:
    - "Do not modify Contract files"
    - "Do not perform another phase's work"
  success_criteria:
    - "Return with a structured result"
    - "Stay within phase ownership boundaries"
  constraints:
    - "Leaf worker only"
    - "No nested spawn"
dependencies: []
parallelization_constraints: []
done_criteria:
  - "Return ready_for_transition=true when this phase is complete"
  - "Return ready_for_parallel_pair=true when shared surface preparation is complete"
  - "For the parallel implementing pair, return ready_for_fan_in=true when the owned slice is complete"
required_tools:
  - "cdd"
required_skills: []
rules_paths: ["{absolute applicable rules file paths}"]
spec_path: "{absolute spec path}"
contract_paths: ["{absolute contract paths}"]
schema_path: "{absolute schema path}"
owned_spec_fields: ["{optional owned Spec keys for parallel phases}"]
findings: []
```

## Phase 1 boundary

Phase 1 is scaffold creation only:

```bash
cdd spec create <name> --schema <id> --domain <domain> --contract <path>
```

After this command, the orchestrator must continue with Phase 2. Any subsequent Spec field editing is owned by `cdd-specifier`.

## Phase 0 contract loop

Contract authoring has no `cdd advance` step.

```
Loop:
  1. Spawn `cdd-contract-writer`.
  2. The worker performs contract authoring, schema-field filling, and impacted Spec review.
  3. If the worker returns blocked or `questions_for_user`:
     -> Ask the user, then re-spawn `cdd-contract-writer` with the answers.
  4. If `objective_packet.user_review=true`:
     -> Present the Contract draft and review summary to the user.
     -> If the user requests changes, re-spawn `cdd-contract-writer`.
  5. When the Contract is approved, return to artifact-state resolution instead of running `cdd advance`.
```

## Generic gate loop

Use this loop for Spec transitions `draft -> specifying`, `specifying -> implementing`, and `validating -> done`. The worker owns the phase loop and the pre-commit `cdd advance` check. The orchestrator owns only user review and `--commit`.

```
Loop:
  1. Spawn the phase owner.
  2. The worker performs:
     -> phase-scoped edits
     -> `cdd advance <spec>` without `--commit`
     -> in-scope Layer 1 fixes
     -> in-scope Layer 2 verification and fixes
     -> re-run until `ready_for_transition=true` or the phase is blocked
  3. If the worker returns blocked:
     -> Re-spawn the preferred role or ask the user when the blocker exceeds worker ownership.
     -> Do not edit directly in the main session.
  4. If `objective_packet.user_review=true`:
     -> Ask the user to review before commit.
     -> If the user requests more work in the same phase, re-spawn the same worker.
     -> If the user requests rollback to an earlier phase, route to that phase owner.
  5. When the worker is ready and the review gate is closed, execute `cdd advance <spec> --commit`.
```

For `implementing`, use an optional scaffold plus fan-out/fan-in loop instead:

```
Loop:
  1. Inspect the Spec and planned files to decide whether shared type/interface/export/runtime surface work is required before the parallel pair can proceed.
  2. If shared surface work is required:
     -> Spawn `cdd-surface-scaffolder`.
     -> If it returns blocked, re-spawn the preferred role or ask the user when the blocker exceeds worker ownership.
     -> When it returns `ready_for_parallel_pair=true`, continue.
  3. Spawn `cdd-test-writer` and `cdd-implementer` in parallel with the same Spec packet.
  4. Each worker performs only its owned edits and returns `ready_for_fan_in=true` or blocked.
  5. If either worker returns blocked:
     -> Re-spawn the preferred role or ask the user when the blocker exceeds worker ownership.
  6. When both workers are ready, inspect their `artifact_reconciliation` output before running `cdd advance`.
  7. If either worker reports target-Spec or related-Spec follow-up:
     -> Spawn `cdd-specifier` in artifact-reconciliation mode.
     -> If it returns blocked or reports Contract drift, ask the user as needed.
     -> After reconciliation completes, re-spawn the affected implementing worker(s) for a fresh pass against the updated Spec, then return to step 6.
  8. If either worker reports Contract drift without an explicit Contract-edit request:
     -> Stop and ask the user.
  9. When the integrated reconciliation state is ready, fan in their outputs and run `cdd advance <spec>` without `--commit` on the integrated state.
  10. If Layer 1 or Layer 2 reports findings:
     -> Route shared type/interface/export/runtime surface findings to `cdd-surface-scaffolder`.
     -> Route `testRef` / acceptance-test findings to `cdd-test-writer`.
     -> Route `sources` / code-implementation findings to `cdd-implementer`.
     -> Route narrative / schema / Contract issues to `cdd-specifier`.
     -> Re-run the scaffold, the pair, or the single owner as needed, then return to step 6.
  11. When the integrated state is clean, execute `cdd advance <spec> --commit`.
```

Phase 2 may need to close two transitions in sequence:
- `draft -> specifying`
- `specifying -> implementing`

If the Spec is still `draft` or `specifying` after a successful commit, keep routing to `cdd-specifier` until the Spec reaches `implementing`.

## Re-spawn routing

| Finding type | Re-spawn target |
|---|---|
| `summary`, `description`, AC condition, schema field, Contract reference, planned `sources` issue | `cdd-specifier` |
| Contract ambiguity, missing business context, or requested Contract refinement while no Spec exists | `cdd-contract-writer` |
| target feature Spec needs modification or added content | `cdd-specifier` |
| implemented or validated behavior requires target Spec update before closure | `cdd-specifier` |
| implementation-driven related Spec consistency update | `cdd-specifier` |
| impacted Spec update discovered after Contract work | `cdd-specifier` |
| related Spec update discovered from `contracts` or `dependsOnSpecs` review | `cdd-specifier` |
| missing importable module, shared type/interface, runtime export, or runtime stub needed before parallel implementing work | `cdd-surface-scaffolder` |
| `testRef.target`, `testRef.pattern`, missing/incorrect tests, or vacuous AC validation while status is `implementing` | `cdd-test-writer` |
| `sources` gaps or code-implementation mismatch while status is `implementing` | `cdd-implementer` |
| integrated `implementing` findings that require shared surface work plus downstream test or code follow-up | `cdd-surface-scaffolder` then `cdd-test-writer` and/or `cdd-implementer` |
| integrated `implementing` findings that require both test and code changes | `cdd-test-writer` + `cdd-implementer` |
| code/test fix needed while status is `validating`, including final AC semantics, constraints, and error-handling coverage without `testRef` changes | `cdd-validator` |
| validating-stage fix requires changing `testRef.target` or `testRef.pattern` | `cdd-test-writer` |
| validating-stage fix requires new shared type/interface/export/runtime surface without changing Spec narrative | `cdd-surface-scaffolder` |
| Contract drift or Contract change required | Stop and ask the user |

The orchestrator must never patch a Spec directly to handle a "small" finding. Re-spawn the correct worker instead.

## User review gate

When `objective_packet.user_review=true`, the orchestrator must:

1. Present the worker's review summary and changed artifacts to the user.
2. Wait for the user's approval or requested changes before phase closure.
3. If the user requests changes inside the current phase, re-spawn the same worker with the review findings.
4. If the user requests rollback to an earlier phase, route to the previous phase owner instead of committing.
5. Run `cdd advance <spec> --commit` only for Spec transitions, and only after the review is explicitly approved.

## Abort conditions

- If the same phase loops 3 or more times without closure, report to the user and ask for judgment.
- If Contract modification is needed, report to the user and wait.
- If the applicable rule files are missing or malformed, report to the user and wait.
- If build/test failures repeat without forward progress, report to the user.

## Completion report

When all Phases are complete, report the following to the user:

```yaml
spec: "{spec path}"
final_status: "done"
phases_completed: ["draft", "specifying", "implementing", "validating", "done"]
commits: ["{commit hash list}"]
files_changed: ["{changed file list}"]
tests_passed: true|false
known_risks: ["{residual risks}"]
```
