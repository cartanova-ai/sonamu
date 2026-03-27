# CDD Shared Contract

Common policies applied to all prompts in the CDD workflow.

## Authority order

Contract > Spec > Code. Higher authority takes precedence on conflict.

## CDD policy source

All sub-agents must read the following document before starting work:
- `./cdd.md`

## Rules directory

The orchestrator and all sub-agents must inspect `contract/rules/` and read the applicable rule files before routing or phase work starts.

- Rule files live under `contract/rules/`
- The orchestrator resolves the applicable files and passes them as `rules_paths` in every phase packet

## Control-plane and execution split

- The main agent acts as the CDD orchestrator and stays in control-plane scope.
- Direct Phase work in the main session is forbidden.
- The only direct artifact mutation allowed to the orchestrator is Phase 1 scaffold creation via `cdd spec create`.
- After scaffold creation, all Spec editing, code writing, test writing, validation work, fix work, and pre-commit transition checks must be delegated to leaf workers.
- If preset sub-agent execution is unavailable, the orchestrator must switch to inline fallback instructions. Missing preset support is never a reason to do Phase work in the main session.

## Role separation

| Role | Responsibility | Description |
|---|---|---|
| Orchestrator | Control plane | Select worker, manage user-review gates, select the Layer 2 backend, run `cdd advance --commit`, manage re-spawn loops |
| Leaf worker | Execution | Perform one phase-scoped mutation in isolated context; Spec-phase workers own pre-commit Layer 1 loops and owned finding fixes |
| CLI | Judgment gate | Run Layer 1 checks and emit a Layer 2 review packet |
| Layer 2 backend | Semantic review | Review the packet and return findings only; never absorb edit ownership |
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
- `rules_paths`
- `findings` when re-spawning after gate failures
- `spec_path`, `contract_paths`, and `schema_path` when the phase operates on a Spec

## User review defaults

- `cdd-contract-writer`: `user_review=true`
- `cdd-specifier`: `user_review=true`
- `cdd-surface-scaffolder`: `user_review=false`
- `cdd-test-writer`: `user_review=false`
- `cdd-implementer`: `user_review=false`
- `cdd-validator`: `user_review=false`

`objective_packet.user_review` tells the orchestrator whether it must ask the user to review the completed phase before closure. For Spec transitions, that review gate sits before `cdd advance <spec> --commit`.

## Sub-agent common rules

- Leaf workers cannot spawn other sub-agents.
- Read every file in `rules_paths` before starting the phase. Internalize `description` and each rule object's `id`, `when`, `instruction`, and `examples` when present.
- Apply every rule that matches the current task and owned scope.
- If `rules_paths` is missing for a governed task, or if any referenced rule file is unreadable or malformed, stop and return a blocking result instead of continuing.
- Do not work beyond the assigned phase scope.
- Return structured results after completion, including `rules_reviewed`.
- `cdd-contract-writer` returns `ready_for_transition: true` when the Contract draft is ready for orchestrator review and follow-up routing. Contract authoring never runs `cdd advance`.
- For Spec phases that own a status transition, execute `cdd advance <spec>` without `--commit` before returning. `cdd-specifier` skips this command when it is spawned only for later-phase artifact reconciliation.
- `cdd-specifier` returns `artifact_reconciliation_complete: true` when it reconciles Spec content for a Spec already in `implementing`, `validating`, or `done`; in that mode it must preserve the current `status` and does not own a `cdd advance` loop.
- `cdd-surface-scaffolder` returns `ready_for_parallel_pair: true` when the shared importable surface and required migration prerequisites are ready.
- The active implementing workers return `ready_for_fan_in: true` when their owned work is ready; the orchestrator then resolves any reported artifact-reconciliation follow-up, runs the integrated `cdd advance <spec>` check, sends the resulting Layer 2 packet to the review backend, and re-routes findings by ownership.
- Any worker that edits a Spec must preserve `schemaVersion` and refresh `lastModified` to today's `YYYY-MM-DD`.
- Resolve in-scope Layer 1 findings inside the worker before returning. When `cdd advance <spec>` emits a delegate payload, return that packet to the orchestrator instead of performing Layer 2 review inside the phase worker.
- If a blocking issue belongs to another worker or requires Contract changes, stop and return the correct re-route target.
- Include `ready_for_transition`, `ready_for_parallel_pair`, `ready_for_fan_in`, or `artifact_reconciliation_complete`, plus `preferred_respawn_role` and `blocking_reason`, when the next control-plane action matters.
- Include `transition_readiness` when the worker owns a `cdd advance` loop so the orchestrator knows whether Layer 1 is clean and whether a Layer 2 review packet is ready.
- Include `ready_for_layer2_review` and `delegate_payload` when the current attempt is waiting on the orchestrator-managed review backend.
- Include `artifact_reconciliation` details when implementation/test/validation work reviewed related Spec or Contract impact.
- Contract files are read-only. Report to orchestrator if modification is needed.
- Do not execute `cdd advance --commit`. The orchestrator manages transitions.

## Layer 2 backend contract

- Layer 2 semantic review is distinct from generic diff review.
- This workflow-specific semantic gate is not the same as generic unit-level diff review, so it may use a different default backend.
- Default backend: `Codex MCP`
- Fallback backend: `cdd-layer2-reviewer`
- The orchestrator owns backend selection and failure fallback.
- The review backend must consume the Layer 2 packet emitted by `cdd advance <spec>` plus the current workflow context.
- The review backend must return findings only and must never edit code, tests, or Specs directly.
- `Codex MCP` review must follow the inherited human-in-the-loop and progress tracking rules from the shared workflow contract.

## Spec ownership boundary

- `cdd-specifier` owns `summary`, `description`, `acceptanceCriteria`, `useTestRef`, schema-defined Spec fields, planned `sources`, `schemaVersion` normalization, and later-phase target/related Spec reconciliation after feature or implementation/test discoveries.
- `cdd-surface-scaffolder` owns shared type/interface/export files, minimal runtime stubs, and Spec-driven migration prerequisites required so downstream tests and implementation can import planned modules and start from the expected schema state. It must not edit Spec files.
- `cdd-test-writer` owns acceptance tests, test support files, and `acceptanceCriteria[].testRef` only when `useTestRef=true`.
- `cdd-implementer` owns production code, implementation support files, and the final `sources` list, and it becomes the sole implementing worker when `useTestRef=false`.
- `cdd-validator` owns the final validation/fix loops plus the `validating -> done` pre-commit verification. It must not edit Spec files; if the fix requires changing `acceptanceCriteria[].testRef` while `useTestRef=true`, it must return `preferred_respawn_role: cdd-test-writer`.
- If a Phase discovers that another worker owns the needed Spec change, it must report that fact to the orchestrator instead of editing across the boundary.

## Implementing preparation and parallel contract

When the active Spec status is `implementing`:
- The orchestrator must first decide whether planned imports or prerequisite schema changes are blocked by missing shared type/interface/export/runtime surface or migration preparation.
- If that shared surface or migration prerequisite is missing, the orchestrator must spawn `cdd-surface-scaffolder` before the parallel pair.
- `cdd-surface-scaffolder` may not edit the Spec and may not add business logic or tests.
- Once the shared surface is ready, the orchestrator must always spawn `cdd-implementer`, and it must also spawn `cdd-test-writer` when `useTestRef=true`.
- Every active implementing worker receives the same `spec_path`, `contract_paths`, `schema_path`, and `rules_paths`, plus explicit ownership boundaries in `objective_packet.constraints`.
- `cdd-surface-scaffolder` returns `ready_for_parallel_pair: true` when imports, exports, shared type/interface scaffolds, and required migration prerequisites are ready for downstream work.
- `cdd-test-writer` may edit only `acceptanceCriteria[].testRef` inside the Spec.
- `cdd-implementer` may edit only `sources` inside the Spec.
- The orchestrator owns the integrated `cdd advance <spec>` loop and the follow-up Layer 2 backend call after the active implementing workers return.
- Re-spawn by ownership: missing shared type/interface/export/runtime surface or migration prerequisite goes to `cdd-surface-scaffolder`; `testRef` and test-semantic findings go to `cdd-test-writer` only when `useTestRef=true`; `sources` and code-implementation findings go to `cdd-implementer`; narrative/schema/Contract findings go to `cdd-specifier`.

## Cross-artifact review rules

- Contract-change work must inspect impacted Specs by finding `.spec.json` files whose `contracts` array references the changed Contract path.
- Contract-phase results must include `impacted_spec_followups` for any downstream Spec updates that need routing.
- Feature-change work must resolve the matching feature Spec first and confirm whether the target Spec needs edits or added content.
- Spec-phase work must read the target Spec's `contracts` and `dependsOnSpecs` before returning `ready_for_transition: true`.
- Spec-phase work should keep planned file layout, export boundaries, and migration prerequisites concrete enough that the orchestrator can tell whether a shared surface scaffold is required before parallel implementation.
- Implementation/test/validation work must compare the current or changed `sources` against the target Spec, then re-check referenced `contracts` and `dependsOnSpecs` before closure.
- If implementation-driven review reveals target-Spec or related-Spec drift, route that work to `cdd-specifier` before the request can close.
- `cdd-specifier` may run in artifact-reconciliation mode for Specs already in `implementing`, `validating`, or `done`; it preserves the current `status` and reconciles only Spec content plus metadata.
- Contract-phase work must return clarifying questions to the orchestrator instead of attempting direct user interaction inside the worker.
- If related Spec updates are needed for consistency, route them to or apply them within `cdd-specifier` scope.
- If Contract drift is found and the user did not explicitly request Contract edits, return a blocking signal instead of mutating Contract files.

## CLI execution context

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
