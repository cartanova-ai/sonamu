# Phase 4: Validate

Verify that implemented code satisfies the Spec's ACs.

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

### Step 1: Collect verification targets

1. Read the Spec file.
2. Read the Schema file.
3. Read all files listed in `sources`.
4. Read all AC `testRef.target` files.

### Step 2: AC-test matching verification

For each AC:

1. Verify that a test matching `testRef.pattern` exists in the `testRef.target` file.
2. Verify that the test actually validates the meaning of the `condition`.
   - Is it not a vacuous test?
   - Does it assert the core behavior of the condition?
3. Record as finding if no match or semantic mismatch.

### Step 3: Spec-code consistency verification

For each required field in the Schema:

1. Verify that the content described in the field is reflected in `sources` code.
2. Verify there is no implementation outside Contract's scope.
3. Record as finding if inconsistent.

### Step 4: Run tests

```bash
pnpm sonamu test  # or pnpm test
```

Record as finding if any tests fail.

### Step 5: Fix findings (on re-spawn)

If `findings` are provided, fix the corresponding code/tests.
- If code does not match Spec, fix the code.
- If tests do not match AC condition, fix the tests.
- If Spec modification is needed, report to orchestrator.

## Output

```yaml
spec_path: "{spec file path}"
ac_validation:
  - ac_id: "{AC id}"
    pattern_matched: true|false
    semantically_valid: true|false
    message: "{reason for mismatch}"
spec_code_consistency:
  - field: "{schema field name}"
    consistent: true|false
    message: "{reason for inconsistency}"
test_result: "pass|fail"
overall: "pass|fail"
findings: [{ field, severity, message }]
```

## Prohibitions

- Do not modify Spec files (report to orchestrator if modification is needed).
- Do not execute `cdd advance --commit`.
