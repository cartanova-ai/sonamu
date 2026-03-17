# Phase 5: Close (Done)

Perform final verification for the validating -> done transition.

## Required reading (mandatory)

- `../cdd.md`
- `../00_cdd_contract.md`

## Input

```yaml
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
layer1_pattern_match_results: {} # pattern match results collected by CLI Layer 1
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: Build + test check

```bash
cd examples/miomock/api
pnpm build
pnpm sonamu test  # or pnpm test
```

Both must pass.

### Step 2: Final AC verification

Items already confirmed by Layer 1:
- All AC `testRef.target` files exist
- All AC `testRef.pattern` are non-empty
- Each pattern matches within the test file

Additional items to verify at this stage:
1. Semantic confirmation that each test **precisely** validates the AC `condition`
2. Tests are not vacuous (contain meaningful assertions)

### Step 3: Constraint reflection check

Verify that constraint-related fields in the Schema are reflected in the code.
- Read the relevant fields and verify each item is reflected in `sources` files.

### Step 4: Error handling coverage check

Verify that failure scenarios defined in error-handling-related Schema fields are tested.
- Verify that a corresponding test exists for each error scenario.

### Step 5: Fix findings (on re-spawn)

If `findings` are provided, fix the corresponding code/tests.

## Output

```yaml
spec_path: "{spec file path}"
build_status: "pass|fail"
test_status: "pass|fail"
ac_semantic_check: "pass|fail"
constraints_reflected: true|false
error_handling_covered: true|false
overall: "pass|fail"
findings: [{ field, severity, message }]
```

## Prohibitions

- Do not execute `cdd advance --commit`.
- Do not modify Spec files (report to orchestrator if modification is needed).
