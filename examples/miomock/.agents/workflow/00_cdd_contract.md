# CDD Shared Contract

Common policies applied to all prompts in the CDD workflow.

## Authority order

Contract > Spec > Code. Higher authority takes precedence on conflict.

## CDD policy source

All sub-agents must read the following document before starting work:
- `./cdd.md`

## Control-plane and execution split

- The main agent acts as the CDD orchestrator and stays in control-plane scope.
- Direct Phase work in the main session is forbidden.
- The only direct artifact mutation allowed to the orchestrator is Phase 1 scaffold creation via `cdd spec create`.
- After scaffold creation, all Spec editing, code writing, test writing, validation work, fix work, and pre-commit transition checks must be delegated to leaf workers.
- If preset sub-agent execution is unavailable, the orchestrator must switch to inline fallback instructions. Missing preset support is never a reason to do Phase work in the main session.

## Role separation

| Role | Responsibility | Description |
|---|---|---|
| Orchestrator | Control plane | Select worker, manage user-review gates, run `cdd advance --commit`, manage re-spawn loops |
| Leaf worker | Execution | Perform one phase-scoped mutation plus the in-scope Layer 1 and Layer 2 pre-commit loop in isolated context |
| CLI | Judgment gate | Run Layer 1 checks and emit delegate payload for Layer 2 |
| Spec document | Memory | State + specification + implementation/test linkage |

## Phase spawn contract

Every spawned Phase task must include:
- `execution_mode`: `preset` or `inline_fallback`
- `role_id`
- `objective_packet` with `global_objective`, `phase_objective`, `unit_objective`, `user_review`, `non_goals`, `success_criteria`, `constraints`
- `dependencies`
- `parallelization_constraints`
- `done_criteria`
- `required_tools`
- `required_skills`
- `findings` when re-spawning after gate failures
- `spec_path`, `contract_paths`, and `schema_path` when the phase operates on a Spec

## User review defaults

- `cdd-contract-writer`: `user_review=false`
- `cdd-specifier`: `user_review=true`
- `cdd-test-writer`: `user_review=false`
- `cdd-implementer`: `user_review=false`
- `cdd-validator`: `user_review=false`

`objective_packet.user_review` tells the orchestrator whether it must ask the user to review the completed phase before `cdd advance <spec> --commit`.

## Sub-agent common rules

- Leaf workers cannot spawn other sub-agents.
- Do not work beyond the assigned phase scope.
- Return structured results after completion.
- For Spec phases except the parallel `implementing` pair, execute `cdd advance <spec>` without `--commit` before returning.
- `cdd-test-writer` and `cdd-implementer` return `ready_for_fan_in: true` when their owned work is ready; the orchestrator then runs the integrated `cdd advance <spec>` check and re-routes findings by ownership.
- Resolve in-scope Layer 1 and Layer 2 findings inside the worker before returning `ready_for_transition: true` or `ready_for_fan_in: true`.
- If a blocking issue belongs to another worker or requires Contract changes, stop and return the correct re-route target.
- Include `ready_for_transition` or `ready_for_fan_in`, `preferred_respawn_role`, and `blocking_reason` when the next control-plane action matters.
- Include `transition_readiness` when the worker owns a `cdd advance` loop so the orchestrator knows whether `cdd advance --commit` is safe to run.
- Contract files are read-only. Report to orchestrator if modification is needed.
- Do not execute `cdd advance --commit`. The orchestrator manages transitions.

## Spec ownership boundary

- `cdd-specifier` owns `summary`, `description`, `acceptanceCriteria`, schema-defined Spec fields, and planned `sources`.
- `cdd-specifier` also owns directly related Spec updates required after reviewing a target Spec's `contracts` and `dependsOnSpecs`.
- `cdd-test-writer` owns acceptance tests, test support files, and `acceptanceCriteria[].testRef`.
- `cdd-implementer` owns production code, implementation support files, and the final `sources` list.
- `cdd-validator` owns the final validation/fix loops plus the `validating -> done` pre-commit verification. It must not edit Spec files; if the fix requires changing `acceptanceCriteria[].testRef`, it must return `preferred_respawn_role: cdd-test-writer`.
- If a Phase discovers that another worker owns the needed Spec change, it must report that fact to the orchestrator instead of editing across the boundary.

## Parallel implementing contract

When the active Spec status is `implementing`:
- The orchestrator must spawn `cdd-test-writer` and `cdd-implementer` as a parallel pair.
- Both workers receive the same `spec_path`, `contract_paths`, and `schema_path`, plus explicit ownership boundaries in `objective_packet.constraints`.
- `cdd-test-writer` may edit only `acceptanceCriteria[].testRef` inside the Spec.
- `cdd-implementer` may edit only `sources` inside the Spec.
- The orchestrator owns the integrated `cdd advance <spec>` loop after both workers return.
- Re-spawn by ownership: `testRef` and test-semantic findings go to `cdd-test-writer`; `sources` and code-implementation findings go to `cdd-implementer`; narrative/schema/Contract findings go to `cdd-specifier`.

## Cross-artifact review rules

- Contract-change work must inspect impacted Specs by finding `.spec.json` files whose `contracts` array references the changed Contract path.
- Contract-phase results must include `impacted_spec_followups` for any downstream Spec updates that need routing.
- Feature-change work must resolve the matching feature Spec first and confirm whether the target Spec needs edits or added content.
- Spec-phase work must read the target Spec's `contracts` and `dependsOnSpecs` before returning `ready_for_transition: true`.
- If related Spec updates are needed for consistency, route them to or apply them within `cdd-specifier` scope.
- If Contract drift is found and the user did not explicitly request Contract edits, return a blocking signal instead of mutating Contract files.

## CLI execution context

- Working directory: `examples/miomock/api`
- CDD CLI is executed via the `cdd` command.
- Check current status with `cdd status`.
- Run tests: check readiness with `pnpm sonamu test -s`, then `pnpm sonamu test` or `pnpm test`.

## Language policy

- All Contract and Spec content (summary, description, AC conditions, schema field values) must be written in Korean.
- Code, file paths, and identifiers remain in English.

## Commit policy

- Scope-first bracket conventional format: `[scope] type: title`
- Separate Spec changes and code changes into distinct commits when possible.
- Do not add Co-Authored-By trailers.

## TypeScript policy

- `as any` and `as unknown as T` are strictly prohibited.
- Resolve type errors through proper type annotations, generics, and type narrowing.

## Validation baseline

- `pnpm check` (Biome): workspace root + affected subprojects
- Build: `pnpm build`
- Tests: `pnpm sonamu test` or `pnpm test`
