# Phase 3A: Write Tests

Write acceptance tests from the confirmed Spec. This worker owns acceptance tests, test support files, and `acceptanceCriteria[].testRef`. Production code and the final `sources` list are owned by `cdd-implementer`.

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
  constraints:
    - "Only edit acceptance tests, test support files, and acceptanceCriteria[].testRef"
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: Review the Spec

1. Read the Spec file and confirm current status is `implementing`.
2. Read the Schema file and internalize all acceptance criteria.
3. Read any existing test files referenced from `acceptanceCriteria[].testRef` or planned in `sources`.

### Step 2: Write acceptance tests

1. Iterate through the AC list and write or update at least one meaningful test for each AC.
2. Re-read the current Spec before writing `acceptanceCriteria[].testRef` so you preserve non-owned `sources` updates from `cdd-implementer`.
3. Fill each AC's `testRef.target` and `testRef.pattern`.
4. `testRef.pattern` must match the `describe`/`it`/`test` name in the target file.
5. Tests must verify the AC `condition` precisely and avoid vacuous assertions.

### Step 3: Run focused verification

```bash
cd examples/miomock/api
pnpm sonamu test -s  # check readiness
pnpm sonamu test {test_file_path}  # or pnpm test
```

If the tests fail because production behavior is missing, keep the assertions intact, record the gap, and return `preferred_respawn_role: cdd-implementer` without weakening the test intent.

### Step 4: Fix findings on re-spawn

If `findings` are provided:
1. Fix the corresponding tests and `acceptanceCriteria[].testRef`.
2. Do not update `sources`; that belongs to `cdd-implementer`.
3. If a finding requires changes to `summary`, `description`, AC conditions, schema-defined fields, or Contract references, report it to the orchestrator so it can spawn `cdd-specifier`.
4. Re-run focused tests.

### Step 5: Return readiness for fan-in

Return `ready_for_fan_in: true` only when:
- each AC has a meaningful test mapping in `acceptanceCriteria[].testRef`
- focused tests are complete for the owned scope
- any production-code blocker is reported through `preferred_respawn_role`

`ready_for_fan_in=true` may still be valid when the current test run fails only because the production behavior is not implemented yet. In that case, keep `preferred_respawn_role: cdd-implementer` and describe the gap clearly.

### Step 6: Commit

Separate Spec changes and test-code changes into distinct commits when possible:
- `[miomock-api] feat: {feature_name} Spec testRef setup` (Spec change)
- `[miomock-api] feat: {feature_name} acceptance tests` (test code)

## Output

```yaml
spec_path: "{spec file path}"
files_changed: ["{list of changed files}"]
tests_added: ["{list of added or updated test files}"]
ac_testref_filled: ["{list of AC ids with testRef filled}"]
commits: ["{commit hashes}"]
test_status: "pass|fail"
ready_for_fan_in: true|false
preferred_respawn_role: "cdd-test-writer|cdd-implementer|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator fan-in handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not implement production behavior.
- Do not modify Contract files.
- Do not modify `sources`.
- Do not rewrite `summary`, `description`, AC conditions, or schema-defined fields in this phase.
- Do not execute `cdd advance <spec>` or `cdd advance --commit`.
