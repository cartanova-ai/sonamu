# Phase 3C: Implement Code

Implement production code according to the confirmed Spec. This worker owns production code, implementation support files, and the final `sources` list. Shared importable surface and migration-prerequisite preparation belong to `cdd-surface-scaffolder`, and acceptance tests plus `acceptanceCriteria[].testRef` are owned by `cdd-test-writer` only when `useTestRef=true`.

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
  constraints:
    - "Only edit production code, implementation support files, and spec.sources"
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
3. Apply every rule that matches the current task and implementation scope.
4. If a required rule file is missing, unreadable, or malformed, stop and return `ready_for_fan_in: false` with `blocking_reason`.

### Step 2: Review the Spec

1. Read the Spec file and confirm current status is `implementing`.
2. Read the referenced Contract files and any related Specs from `dependsOnSpecs`.
3. Read the Schema file and understand the custom field structure.
4. Internalize all schema fields and ACs. These are the implementation criteria.
5. Assume any required shared importable surface and migration prerequisite have already been prepared. If missing shared types/interfaces/exports or unapplied migration prerequisites block the implementation, report that gap instead of broadening this worker's scope.
6. If `useTestRef=false`, treat this worker as the only implementing-phase worker after any required surface scaffold.

### Step 3: Implement code

1. Implement according to the structure defined in the Spec's schema fields.
2. If a better structure appears during implementation, do not change code first.
3. Report Spec-content changes back to the orchestrator so it can spawn `cdd-specifier`.
4. If new shared type/interface/export/runtime scaffolds or migration prerequisites are required before meaningful logic can proceed, return `preferred_respawn_role: cdd-surface-scaffolder`.
5. Re-read the current Spec before writing `sources` so you preserve non-owned `testRef` updates from `cdd-test-writer` when `useTestRef=true`, keep `schemaVersion`, and refresh `lastModified`.
6. Update `sources` when new implementation files are added or when you need to reconcile the integrated file list after fan-in.

### Step 4: Run focused verification

```bash
pnpm sonamu test -s  # check readiness
pnpm build
pnpm check  # Biome lint/format
```

If tests already exist for your target behavior, you may run focused test files. On failure, fix the code. The behavior defined in the Spec is the standard.

### Step 5: Fix findings on re-spawn

If `findings` are provided:
1. Fix the corresponding production code and `sources`.
2. Do not update `acceptanceCriteria[].testRef`; that belongs to `cdd-test-writer`.
3. If a finding requires shared type/interface/export/runtime surface work or migration-prerequisite work without business-logic changes, return `preferred_respawn_role: cdd-surface-scaffolder`.
4. If a finding requires changes to tests or test semantics only and `useTestRef=true`, return `preferred_respawn_role: cdd-test-writer`.
5. If a finding requires changes to `summary`, `description`, AC conditions, schema-defined fields, or Contract references, report it to the orchestrator so it can spawn `cdd-specifier`.
6. Re-run focused checks.

### Step 6: Review implementation-driven artifact impact

1. Compare the implemented behavior, changed file layout, exported surface, constraints, and error handling against the target Spec and any other source-linked Spec impacted by the changed files.
2. Find every Spec whose `sources` includes a changed file from this worker's output, including the target Spec when applicable.
3. Re-check those source-linked Specs and their `sources`, `contracts`, and `dependsOnSpecs` before returning.
4. If the target Spec or any source-linked Spec needs updates to reflect the confirmed implementation, return `preferred_respawn_role: cdd-specifier` with details instead of leaving code-only drift.
5. If the review reveals Contract drift, do not edit Contract files. Return a blocking reason for the orchestrator to escalate.

### Step 7: Return readiness for fan-in

Return `ready_for_fan_in: true` only when:
- owned production-code work is complete for the current attempt
- `sources` reflects the implementation files you own or the reconciled integrated file list you were asked to repair
- focused checks are complete for your scope
- artifact reconciliation review is complete for the current implementation-driven findings
- any out-of-scope issue is reported through `preferred_respawn_role`

`ready_for_fan_in=true` may still be valid when owned code work is complete but later-phase Spec reconciliation is still required. In that case, keep `preferred_respawn_role: cdd-specifier` and describe the gap clearly.

### Step 8: Commit

If this phase creates commits, separate Spec changes and code changes when practical, and follow the repository's Korean commit-message policy.

## Output

```yaml
spec_path: "{spec file path}"
rules_reviewed: ["{rule ids read from rules_paths}"]
files_changed: ["{list of changed files}"]
sources_updated: ["{list of source paths added or corrected}"]
commits: ["{commit hashes}"]
build_status: "pass|fail"
test_status: "pass|fail"
artifact_reconciliation:
  sources_reviewed: ["{source paths reviewed}"]
  source_linked_specs_reviewed: ["{spec paths whose sources include changed files}"]
  contracts_reviewed: ["{contract paths reviewed}"]
  dependsOnSpecs_reviewed: ["{related spec paths reviewed}"]
  target_spec_update_needed: true|false
  related_spec_followups: ["{related spec paths that still need follow-up}"]
  contract_drift: true|false
ready_for_fan_in: true|false
preferred_respawn_role: "cdd-implementer|cdd-surface-scaffolder|cdd-test-writer|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator fan-in handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not implement features not in the Spec.
- Do not modify Contract files.
- Do not modify `acceptanceCriteria[].testRef`.
- Do not absorb shared type/interface/export/runtime scaffold work or migration-prerequisite work into this role when that work exists only to unblock downstream imports or schema readiness.
- Do not execute `cdd advance <spec>` or `cdd advance --commit`; the orchestrator owns the shared gate for this phase.
- If Spec and code conflict, fix the code. Never change Spec to match code.
- Do not rewrite `summary`, `description`, AC conditions, or schema-defined fields in this phase.
- `as any` and `as unknown as T` are strictly prohibited.
