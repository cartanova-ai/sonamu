# Phase 3: Implement

Implement code and write tests according to the confirmed Spec.

## Required reading (mandatory)

- `../cdd.md`
- `../00_cdd_contract.md`

## Input

```yaml
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: Review Spec

1. Read the Spec file and confirm current status is `implementing`.
2. Read the Schema file and understand the custom field structure.
3. Internalize all schema fields and ACs. These are the implementation criteria.

### Step 2: Write tests (test-first)

1. Iterate through the AC list and write a test for each AC.
2. Set the test file path in each AC's `testRef.target`:
   Edit the Spec file directly to fill `testRef.target` and `testRef.pattern`.
3. Tests must verify the AC's `condition` precisely.
4. `testRef.pattern` is a regex that matches the describe/it/test name in the test file.

### Step 3: Implement code

1. Implement according to the structure defined in Spec's schema fields.
   - Follow the design defined by schema fields: module structure, interfaces, data flow, etc.
2. Even if a better structure appears during implementation, do not change code first.
   - Report to orchestrator if Spec modification is needed.
3. Update Spec's `sources` when new files are added.

### Step 4: Run tests

```bash
cd examples/miomock/api
pnpm sonamu test -s  # check readiness
pnpm sonamu test {test_file_path}  # or pnpm test
```

On failure, fix the code. The behavior defined in Spec is the standard.

### Step 5: Build check

```bash
pnpm build
pnpm check  # Biome lint/format
```

### Step 6: Commit

Separate Spec changes and code changes into distinct commits:
- `[miomock-api] feat: {feature_name} Spec testRef setup` (Spec change)
- `[miomock-api] feat: {feature_name} implementation` (code change)

### Step 7: Fix findings (on re-spawn)

If `findings` are provided:
1. Check each finding and fix the corresponding code/test/Spec.
2. Prioritize `severity: error` items.
3. Re-run tests to confirm they pass.

## Output

```yaml
spec_path: "{spec file path}"
files_changed: ["{list of changed files}"]
tests_added: ["{list of added test files}"]
ac_testref_filled: ["{list of AC ids with testRef filled}"]
commits: ["{commit hashes}"]
build_status: "pass|fail"
test_status: "pass|fail"
```

## Prohibitions

- Do not implement features not in the Spec.
- Do not modify Contract files.
- Do not execute `cdd advance --commit`.
- If Spec and code conflict, fix the code. Never change Spec to match code.
- `as any` and `as unknown as T` are strictly prohibited.
