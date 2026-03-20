# Phase 3: Implement

Implement code and write tests according to the confirmed Spec. This phase owns code, tests, `sources`, and `acceptanceCriteria[].testRef`.

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

### Step 1: Review the Spec

1. Read the Spec file and confirm current status is `implementing`.
2. Read the Schema file and understand the custom field structure.
3. Internalize all schema fields and ACs. These are the implementation criteria.

### Step 2: Write tests first

1. Iterate through the AC list and write a test for each AC.
2. Fill each AC's `testRef.target` and `testRef.pattern`.
3. `testRef.pattern` must match the describe/it/test name in the test file.
4. Tests must verify the AC `condition` precisely.

### Step 3: Implement code

1. Implement according to the structure defined in the Spec's schema fields.
2. If a better structure appears during implementation, do not change code first.
3. Report Spec-content changes back to the orchestrator so it can spawn `cdd-specifier`.
4. Update `sources` when new implementation or test files are added.

### Step 4: Run tests

```bash
cd examples/miomock/api
pnpm sonamu test -s  # check readiness
pnpm sonamu test {test_file_path}  # or pnpm test
```

On failure, fix the code. The behavior defined in the Spec is the standard.

### Step 5: Build and format checks

```bash
pnpm build
pnpm check  # Biome lint/format
```

### Step 6: Fix findings on re-spawn

If `findings` are provided:
1. Fix the corresponding code and tests.
2. You may update `sources` and `acceptanceCriteria[].testRef`.
3. If a finding requires changes to `summary`, `description`, AC conditions, schema-defined fields, or Contract references, report it to the orchestrator so it can spawn `cdd-specifier`.
4. Re-run tests and checks.

### Step 7: Run the pre-commit transition check

1. Run `cdd advance <spec>` without `--commit`.
2. If Layer 1 fails because `sources`, `testRef.target`, or other implementation-owned data is incomplete, fix it and re-run the command.
3. If the CLI emits delegate output, perform the Layer 2 semantic verification inside this worker:
   - code implements the Spec faithfully
   - tests validate each AC condition precisely
   - `sources` and `testRef` stay aligned with the actual implementation
4. Fix in-scope findings and re-run `cdd advance <spec>` until both layers pass or the phase is blocked.
5. If the remaining issue requires Spec narrative or schema-field changes, stop and return `preferred_respawn_role: cdd-specifier`.

### Step 8: Commit

Separate Spec changes and code changes into distinct commits:
- `[miomock-api] feat: {feature_name} Spec testRef setup` (Spec change)
- `[miomock-api] feat: {feature_name} implementation` (code change)

## Output

```yaml
spec_path: "{spec file path}"
transition_readiness:
  checked_with: "cdd advance <spec>"
  layer1_result: "pass|fail"
  layer2_result: "pass|fail"
files_changed: ["{list of changed files}"]
tests_added: ["{list of added test files}"]
ac_testref_filled: ["{list of AC ids with testRef filled}"]
commits: ["{commit hashes}"]
build_status: "pass|fail"
test_status: "pass|fail"
ready_for_transition: true|false
preferred_respawn_role: "cdd-implementer|cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator review handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not implement features not in the Spec.
- Do not modify Contract files.
- Do not execute `cdd advance --commit`.
- If Spec and code conflict, fix the code. Never change Spec to match code.
- Do not rewrite `summary`, `description`, AC conditions, or schema-defined fields in this phase.
- `as any` and `as unknown as T` are strictly prohibited.
