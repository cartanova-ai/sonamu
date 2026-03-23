# Phase 3A: Surface Scaffold

Prepare the minimal shared importable surface required before parallel test writing and code implementation can proceed safely. This worker owns shared types, interfaces, exports, DTO/schema support files, module entrypoints, and placeholder runtime stubs when they are needed only so downstream imports resolve. Business logic, acceptance tests, `acceptanceCriteria[].testRef`, and the final `sources` list belong to other workers.

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
    - "Only edit shared type/interface/export files and minimal runtime scaffolds required for planned imports"
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: Review the current surface

1. Read the Spec file and confirm current status is `implementing`.
2. Read the Schema file and internalize the planned module boundaries, schema-defined structure, and ACs.
3. Read the files already referenced in `sources`, plus any missing file paths implied by current imports or previous findings.
4. Identify exactly which imports, exports, shared types/interfaces, DTO/schema helpers, or runtime entrypoints are missing and would block `cdd-test-writer` or `cdd-implementer`.

### Step 2: Prepare the minimal importable surface

1. Create or update only the minimum files, exports, and type/interface definitions required so the planned modules are importable.
2. If a runtime symbol must exist before downstream work can start, add the smallest explicit placeholder body needed to keep imports resolvable.
3. Use obvious non-final placeholders such as `throw new Error("Not implemented yet")` only when a runtime export is required.
4. Do not add business logic, production behavior, or test assertions in this phase.
5. Do not update Spec files. `cdd-implementer` still owns the final `sources` list.

### Step 3: Run focused verification

```bash
cd examples/miomock/api
pnpm build
pnpm check
```

If the shared surface cannot be finalized without changing Spec narrative, schema-defined fields, AC conditions, or Contract scope, stop and return `preferred_respawn_role: cdd-specifier`.

### Step 4: Fix findings on re-spawn

If `findings` are provided:
1. Fix only the missing shared type/interface/export/runtime surface findings.
2. If the remaining blocker is now business logic rather than shared surface, return `preferred_respawn_role: cdd-implementer`.
3. If the remaining blocker is test semantics rather than shared surface, return `preferred_respawn_role: cdd-test-writer`.
4. If Spec narrative, schema-defined fields, or Contract scope must change, return `preferred_respawn_role: cdd-specifier`.
5. Re-run focused verification.

### Step 5: Return readiness for the parallel pair

Return `ready_for_parallel_pair: true` only when:
- downstream workers can import the planned modules they need
- required shared types/interfaces and runtime exports exist
- focused checks are complete for the owned surface scope
- any remaining out-of-scope blocker is reported through `preferred_respawn_role`

## Output

```yaml
spec_path: "{spec file path}"
files_changed: ["{list of changed files}"]
surface_files_prepared: ["{list of shared surface files added or updated}"]
runtime_exports_prepared: ["{list of runtime exports or entrypoints prepared}"]
build_status: "pass|fail"
check_status: "pass|fail"
ready_for_parallel_pair: true|false
preferred_respawn_role: "cdd-surface-scaffolder|cdd-test-writer|cdd-implementer|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not implement business logic.
- Do not write acceptance tests.
- Do not modify Spec files, including `sources` and `acceptanceCriteria[].testRef`.
- Do not modify Contract files.
- Do not execute `cdd advance <spec>` or `cdd advance --commit`.
