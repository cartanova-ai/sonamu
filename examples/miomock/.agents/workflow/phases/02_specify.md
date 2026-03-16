# Phase 2: Specify

Refine the Spec. Complete all fields required for the draft -> specifying -> implementing transition.

## Required reading (mandatory)

- `../../api/contract/cdd.md`
- `../00_cdd_contract.md`

## Input

```yaml
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
findings: [] # previous verification failures on re-spawn
```

## Procedure

### Step 1: draft -> specifying transition

Only perform if current status is `draft`.

1. Verify that the Spec's `contracts` field references a valid Contract.
2. Request the orchestrator to execute `cdd advance` (sub-agent does not transition directly).

### Step 2: Contract analysis

1. Read the referenced Contract.
2. Read the Schema file to identify which custom fields are needed.
3. Identify the scope this Spec must cover from Contract's `features`, `businessRules`, `edgeCases`.

### Step 3: Fill schema fields

Iterate through the Schema's `fields` array and fill each field:

- `Record<string, string>` type: define key-value pairs for modules/interfaces/errors etc.
- `string[]` type: ordered item lists (flows, constraints, etc.)

Each field's content must:
- Stay within the Contract's scope.
- Be consistent with Spec's `summary`/`description`.
- Maintain consistency across cross-references between fields.

### Step 4: Define ACs

1. Derive verifiable conditions from Contract's `businessRules`, `edgeCases`.
2. Derive additional conditions from schema fields' error handling and constraints.
3. Write each AC by directly editing the Spec JSON file's `acceptanceCriteria` array:
   - `condition`: specific condition that can be judged as pass/fail. Vague expressions like "works well" are prohibited.
   - `testRef` is left empty at this stage (filled during implementing phase).

### Step 5: Plan sources

Add planned implementation file paths to `sources` (relative to project root).

### Step 6: Fix findings (on re-spawn)

If `findings` are provided:
1. Check each finding's `field` and `message`.
2. Fix the corresponding field.
3. Prioritize `severity: error` items.

## Output

```yaml
spec_path: "{spec file path}"
fields_completed: ["{list of filled fields}"]
ac_count: "{number of defined ACs}"
sources_planned: ["{list of planned source files}"]
```

## Prohibitions

- Do not write code.
- Do not modify Contract files. Report to orchestrator if modification is needed.
- Do not execute `cdd advance --commit`.
