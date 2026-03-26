# Phase 4: Validate

Verify that a Spec already in `validating` is ready for the final `validating -> done` commit. This phase owns validating-stage code/test fixes and final pre-commit verification, not Spec authoring.

## Required reading (mandatory)

- `../cdd.md`
- `../00_cdd_contract.md`
- `rules_paths`

## Input

```yaml
execution_mode: preset|inline_fallback
objective_packet:
  global_objective: "..."
  phase_objective: "..."
  unit_objective: "..."
  user_review: true|false
rules_paths: ["{applicable rules file paths}"]
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: Load applicable rules

1. Read every file in `rules_paths`.
2. Internalize each rule file's `description` and each rule object's `id`, `when`, `instruction`, and `examples` when present.
3. Apply every rule that matches the current task and validation scope.
4. If a required rule file is missing, unreadable, or malformed, stop and return `ready_for_transition: false` with `blocking_reason`.

### Step 2: Review current state

1. Read the Spec file and confirm current status is `validating`.
2. Read the referenced Contract files and any related Specs from `dependsOnSpecs`.
3. Read the Schema file.
4. Read all files listed in `sources`.
5. When `useTestRef=true`, read all AC `testRef.target` files.

### Step 3: Verify AC-test matching

When `useTestRef=true`:
1. For each AC, verify that a test matching `testRef.pattern` exists in the `testRef.target` file.
2. Verify that the test actually validates the meaning of the `condition`.
3. Record a finding if the match is missing or semantically weak.

When `useTestRef=false`:
1. Skip `testRef`-based matching.
2. Verify each AC directly against the implementation and user-facing flow in `sources`.
3. Record a finding if the implementation does not make the AC meaning observable.

### Step 4: Verify Spec-code consistency

For each required Schema field:
1. Verify that the field content is reflected in `sources`.
2. Verify there is no implementation outside Contract scope.
3. Record a finding if inconsistent.

### Step 5: Run build and tests

When `useTestRef=true`:

```bash
pnpm build
pnpm sonamu test  # or pnpm test
```

When `useTestRef=false`, run only the build step that is meaningful for the current implementation scope and rely on direct implementation validation instead of test execution.

Record a finding if build or tests fail.

### Step 6: Verify constraint and error-handling coverage

1. Verify that constraint-related Schema fields are reflected in the code.
2. Verify that failure scenarios defined in error-handling-related Schema fields are covered by tests when `useTestRef=true`, or by direct implementation evidence when `useTestRef=false`.
3. Record a finding if coverage is missing or semantically weak.

### Step 7: Review validation-driven artifact impact

1. When validation fixes materially change behavior or expose missing documented behavior, find every Spec whose `sources` includes a changed file from the validation work.
2. Re-check those source-linked Specs and their `contracts` and `dependsOnSpecs`.
3. If validation confirms that the implementation is correct but the target Spec or any source-linked Spec is incomplete or stale, return `preferred_respawn_role: cdd-specifier`.
4. If the review reveals Contract drift, do not edit Contract files. Return a blocking reason for the orchestrator to escalate.

### Step 8: Fix findings on re-spawn

If `findings` are provided:
- Fix code and tests that fail the validating-stage checks.
- If the fix requires new shared type/interface/export/runtime surface without meaningful business-logic work, return `preferred_respawn_role: cdd-surface-scaffolder`.
- If the fix requires changing `acceptanceCriteria[].testRef` and `useTestRef=true`, return `preferred_respawn_role: cdd-test-writer`.
- If Spec narrative or schema-field modification is needed, report that to the orchestrator so it can spawn `cdd-specifier`.

### Step 9: Run the pre-commit transition check

1. Run `cdd advance <spec>` without `--commit`.
2. If Layer 1 fails because `testRef.pattern` or other `testRef` data is incomplete while `useTestRef=true`, return `preferred_respawn_role: cdd-test-writer` instead of patching the Spec directly.
3. If build/test evidence fails, or if Layer 1/Layer 2 still exposes test-file semantics gaps while `useTestRef=true`, fix the code/tests and re-run the command.
4. If the CLI emits delegate output, perform the Layer 2 semantic verification inside this worker:
   - when `useTestRef=true`, each mapped test semantically validates the AC condition
   - when `useTestRef=false`, each AC condition is observable in the implementation or user flow without relying on `testRef`
   - constraint-related expectations are reflected in code and, when applicable, tests
   - error-handling scenarios are covered with meaningful assertions or implementation evidence
5. Fix in-scope findings and re-run `cdd advance <spec>` until both layers pass or the phase is blocked.
6. If the remaining issue requires `testRef` changes and `useTestRef=true`, stop and return `preferred_respawn_role: cdd-test-writer`.
7. If the remaining issue requires shared type/interface/export/runtime surface work without Spec narrative changes, stop and return `preferred_respawn_role: cdd-surface-scaffolder`.
8. If the remaining issue requires Spec narrative or schema-field changes, or if the validated implementation is correct but the documented behavior is stale, stop and return `preferred_respawn_role: cdd-specifier`.

### Step 10: Return transition readiness

Return `ready_for_transition: true` only when:
- the latest `cdd advance <spec>` check is clean
- build/test evidence is acceptable for the current scope
- artifact reconciliation review is complete and does not require unresolved Spec or Contract follow-up
- no out-of-scope blocker remains

## Output

```yaml
spec_path: "{spec file path}"
rules_reviewed: ["{rule ids read from rules_paths}"]
transition_readiness:
  checked_with: "cdd advance <spec>"
  layer1_result: "pass|fail"
  layer2_result: "pass|fail"
ac_validation:
  - ac_id: "{AC id}"
    pattern_matched: true|false
    semantically_valid: true|false
    message: "{reason for mismatch}"
spec_code_consistency:
  - field: "{schema field name}"
    consistent: true|false
    message: "{reason for inconsistency}"
build_status: "pass|fail"
test_status: "pass|fail|not_run"
artifact_reconciliation:
  sources_reviewed: ["{source paths reviewed}"]
  source_linked_specs_reviewed: ["{spec paths whose sources include changed files}"]
  contracts_reviewed: ["{contract paths reviewed}"]
  dependsOnSpecs_reviewed: ["{related spec paths reviewed}"]
  target_spec_update_needed: true|false
  related_spec_followups: ["{related spec paths that still need follow-up}"]
  contract_drift: true|false
constraints_reflected: true|false
error_handling_covered: true|false
overall: "pass|fail"
findings: [{ field, severity, message }]
ready_for_transition: true|false
preferred_respawn_role: "cdd-validator|cdd-test-writer|cdd-surface-scaffolder|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator review handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not modify Spec files (report to orchestrator if modification is needed).
- Do not execute `cdd advance --commit`.
