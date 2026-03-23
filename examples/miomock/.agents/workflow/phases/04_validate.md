# Phase 4: Validate

Verify that a Spec already in `validating` is ready for the final `validating -> done` commit. This phase owns validating-stage code/test fixes and final pre-commit verification, not Spec authoring.

## Required reading (mandatory)

- `../cdd.md`
- `../00_cdd_contract.md`

## Input

```yaml
execution_mode: preset|inline_fallback
objective_packet:
  global_objective: "..."
  phase_objective: "..."
  unit_objective: "..."
  user_review: true|false
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: Review current state

1. Read the Spec file and confirm current status is `validating`.
2. Read the Schema file.
3. Read all files listed in `sources`.
4. Read all AC `testRef.target` files.

### Step 2: Verify AC-test matching

For each AC:
1. Verify that a test matching `testRef.pattern` exists in the `testRef.target` file.
2. Verify that the test actually validates the meaning of the `condition`.
3. Record a finding if the match is missing or semantically weak.

### Step 3: Verify Spec-code consistency

For each required Schema field:
1. Verify that the field content is reflected in `sources`.
2. Verify there is no implementation outside Contract scope.
3. Record a finding if inconsistent.

### Step 4: Run build and tests

```bash
pnpm build
pnpm sonamu test  # or pnpm test
```

Record a finding if build or tests fail.

### Step 5: Verify constraint and error-handling coverage

1. Verify that constraint-related Schema fields are reflected in the code.
2. Verify that failure scenarios defined in error-handling-related Schema fields are covered by tests.
3. Record a finding if coverage is missing or semantically weak.

### Step 6: Fix findings on re-spawn

If `findings` are provided:
- Fix code and tests that fail the validating-stage checks.
- If the fix requires changing `acceptanceCriteria[].testRef`, return `preferred_respawn_role: cdd-test-writer`.
- If Spec narrative or schema-field modification is needed, report that to the orchestrator so it can spawn `cdd-specifier`.

### Step 7: Run the pre-commit transition check

1. Run `cdd advance <spec>` without `--commit`.
2. If Layer 1 fails because `testRef.pattern` or other `testRef` data is incomplete, return `preferred_respawn_role: cdd-test-writer` instead of patching the Spec directly.
3. If Layer 1 fails because build status or test-file semantics are incomplete, fix the code/tests and re-run the command.
4. If the CLI emits delegate output, perform the Layer 2 semantic verification inside this worker:
   - each mapped test semantically validates the AC condition
   - constraint-related expectations are reflected in code and tests
   - error-handling scenarios are covered with meaningful assertions
5. Fix in-scope findings and re-run `cdd advance <spec>` until both layers pass or the phase is blocked.
6. If the remaining issue requires `testRef` changes, stop and return `preferred_respawn_role: cdd-test-writer`.
7. If the remaining issue requires Spec narrative or schema-field changes, stop and return `preferred_respawn_role: cdd-specifier`.

## Output

```yaml
spec_path: "{spec file path}"
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
test_status: "pass|fail"
constraints_reflected: true|false
error_handling_covered: true|false
overall: "pass|fail"
findings: [{ field, severity, message }]
ready_for_transition: true|false
preferred_respawn_role: "cdd-validator|cdd-test-writer|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator review handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not modify Spec files (report to orchestrator if modification is needed).
- Do not execute `cdd advance --commit`.
