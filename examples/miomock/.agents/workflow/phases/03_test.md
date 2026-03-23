# Phase 3B: Write Tests

Write acceptance tests from the confirmed Spec. This worker owns acceptance tests, test support files, and `acceptanceCriteria[].testRef`. Shared importable surface preparation belongs to `cdd-surface-scaffolder`, and production code plus the final `sources` list are owned by `cdd-implementer`.

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
3. Read the referenced Contract files and any related Specs from `dependsOnSpecs` when they constrain acceptance semantics.
4. Read any existing test files referenced from `acceptanceCriteria[].testRef` or planned in `sources`.
5. Assume any required shared importable surface has already been prepared. If it has not, report that gap instead of creating it here.

### Step 2: Write acceptance tests

1. Iterate through the AC list and write or update at least one meaningful test for each AC.
2. Re-read the current Spec before writing `acceptanceCriteria[].testRef` so you preserve non-owned `sources` updates from `cdd-implementer`, keep `schemaVersion`, and refresh `lastModified`.
3. Fill each AC's `testRef.target` and `testRef.pattern`.
4. `testRef.pattern` must match the `describe`/`it`/`test` name in the target file.
5. Tests must verify the AC `condition` precisely and avoid vacuous assertions.

### Step 3: Run focused verification

```bash
cd examples/miomock/api
pnpm sonamu test -s  # check readiness
pnpm sonamu test {test_file_path}  # or pnpm test
```

If the tests fail because required modules, shared types/interfaces, runtime exports, or placeholder runtime entrypoints are missing, keep the assertions intact, record the gap, and return `preferred_respawn_role: cdd-surface-scaffolder`.

If the tests fail because production behavior is missing after the shared surface already exists, keep the assertions intact, record the gap, and return `preferred_respawn_role: cdd-implementer` without weakening the test intent.

### Step 4: Fix findings on re-spawn

If `findings` are provided:
1. Fix the corresponding tests and `acceptanceCriteria[].testRef`.
2. Do not update `sources`; that belongs to `cdd-implementer`.
3. If a finding requires shared type/interface/export/runtime surface work, return `preferred_respawn_role: cdd-surface-scaffolder`.
4. If a finding requires changes to `summary`, `description`, AC conditions, schema-defined fields, or Contract references, report it to the orchestrator so it can spawn `cdd-specifier`.
5. Re-run focused tests.

### Step 5: Review test-driven artifact impact

1. Review whether the acceptance tests or `testRef` mappings exposed stale target-Spec narrative, AC intent, schema-defined constraints, or related Spec content.
2. Inspect the current `sources`, then re-check referenced Contracts and `dependsOnSpecs` before returning.
3. If the target Spec or related Specs need updates, return `preferred_respawn_role: cdd-specifier` with details instead of silently leaving drift.
4. If the review reveals Contract drift, do not edit Contract files. Return a blocking reason for the orchestrator to escalate.

### Step 6: Return readiness for fan-in

Return `ready_for_fan_in: true` only when:
- each AC has a meaningful test mapping in `acceptanceCriteria[].testRef`
- focused tests are complete for the owned scope
- artifact reconciliation review is complete for the current test-driven findings
- any shared-surface or production-code blocker is reported through `preferred_respawn_role`

`ready_for_fan_in=true` may still be valid when the current test run fails only because the production behavior is not implemented yet, or when owned test work is complete but later-phase Spec reconciliation is still required. In those cases, keep `preferred_respawn_role` set to the owning follow-up role and describe the gap clearly.

### Step 7: Commit

If this phase creates commits, separate Spec changes and test-code changes when practical, and follow the repository's Korean commit-message policy.

## Output

```yaml
spec_path: "{spec file path}"
files_changed: ["{list of changed files}"]
tests_added: ["{list of added or updated test files}"]
ac_testref_filled: ["{list of AC ids with testRef filled}"]
commits: ["{commit hashes}"]
test_status: "pass|fail"
artifact_reconciliation:
  sources_reviewed: ["{source paths reviewed}"]
  contracts_reviewed: ["{contract paths reviewed}"]
  dependsOnSpecs_reviewed: ["{related spec paths reviewed}"]
  target_spec_update_needed: true|false
  related_spec_followups: ["{related spec paths that still need follow-up}"]
  contract_drift: true|false
ready_for_fan_in: true|false
preferred_respawn_role: "cdd-test-writer|cdd-surface-scaffolder|cdd-implementer|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator fan-in handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not implement production behavior.
- Do not modify Contract files.
- Do not modify `sources`.
- Do not create shared type/interface/export/runtime scaffolds outside test-owned files; that belongs to `cdd-surface-scaffolder`.
- Do not rewrite `summary`, `description`, AC conditions, or schema-defined fields in this phase.
- Do not execute `cdd advance <spec>` or `cdd advance --commit`.
