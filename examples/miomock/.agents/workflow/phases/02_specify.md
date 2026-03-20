# Phase 2: Specify

Refine the Spec until it is ready to enter `implementing`. This phase owns Spec content edits for both `draft -> specifying` and `specifying -> implementing`.

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

1. Read the Spec file and confirm the current status is `draft` or `specifying`.
2. Read the referenced Contract files from the Spec `contracts` array.
3. Read any related Spec files listed in `dependsOnSpecs`.
4. Read the Schema file and identify all required custom fields.
5. If the Spec is already `implementing` or later, stop and return `ready_for_transition: false`.
6. For feature-change requests, decide whether the target Spec needs modification, additional content, or no change before touching related artifacts.

### Step 2: Fill the core narrative

Write or refine the Spec's:
- `summary`
- `description`

The narrative must stay within the referenced Contract scope and clearly describe one feature.

### Step 3: Fill schema-defined fields

Read the Schema `fields` array and fill each field according to its `description` and `type`.

Each field must:
- stay within Contract scope
- be consistent with `summary` and `description`
- maintain consistency across cross-references between fields
- accurately reflect what the field `description` requires

### Step 4: Define acceptance criteria

1. Derive verifiable conditions from Contract `businessRules` and `edgeCases`.
2. Derive additional conditions from schema fields such as error handling and constraints.
3. Write each AC directly in `acceptanceCriteria`.
4. `condition` must be concrete and pass/fail verifiable.
5. Leave `testRef.target` and `testRef.pattern` empty at this phase. Those are filled during implementation.

### Step 5: Plan implementation sources

Add planned implementation and test file paths to `sources` when they are knowable at Spec time.

### Step 6: Fix findings on re-spawn

If `findings` are provided:
1. Check each finding's `field` and `message`.
2. Fix the corresponding Spec content.
3. Prioritize `severity: error` items.

### Step 7: Review related artifact impact

1. Treat feature-change requests as target-Spec-first work: update or extend the target Spec before deciding any downstream follow-up.
2. Re-check the target Spec's `contracts` and `dependsOnSpecs` after your edits.
3. Confirm whether related Specs also need updates to stay consistent.
4. If consistency requires related Spec edits, update those related Specs within `cdd-specifier` scope and track them in `related_spec_updates`.
5. If a related artifact review reveals contract drift, do not edit the Contract unless the user explicitly requested Contract changes.
6. When contract drift blocks closure, return `ready_for_transition: false` and report `blocking_reason`.

### Step 8: Run the pre-commit transition check

1. Run `cdd advance <spec>` without `--commit`.
2. If Layer 1 fails because required Spec content is still missing or malformed, fix the Spec and re-run the command.
3. If the CLI emits delegate output, perform the Layer 2 semantic verification inside this worker:
   - field descriptions are reflected faithfully
   - ACs are concrete and testable
   - content stays within Contract scope
   - cross-field consistency is preserved
4. Fix in-scope findings and re-run `cdd advance <spec>` until both layers pass or the phase is blocked.
5. If you determine that the Contract must change, stop and return `ready_for_transition: false`.

### Step 9: Return transition readiness

Return `ready_for_transition: true` only when:
- `summary` and `description` are coherent
- required schema fields are filled
- ACs are concrete and non-empty
- planned `sources` are coherent enough for downstream work
- related Specs are updated or explicitly routed for follow-up
- the latest `cdd advance <spec>` check is clean for the current transition

## Output

```yaml
spec_path: "{spec file path}"
transition_readiness:
  checked_with: "cdd advance <spec>"
  layer1_result: "pass|fail"
  layer2_result: "pass|fail"
fields_completed: ["{list of filled fields}"]
ac_count: "{number of defined ACs}"
sources_planned: ["{list of planned source files}"]
target_spec_assessment:
  action: "modify|extend|no_change"
  rationale: "{why the target Spec did or did not need updates}"
related_artifacts_reviewed:
  contracts: ["{contract paths reviewed}"]
  dependsOnSpecs: ["{related spec paths reviewed}"]
related_spec_updates: ["{related spec paths updated}"]
related_spec_followups: ["{related spec paths that still need follow-up}"]
contract_drift: true|false
ready_for_transition: true|false
preferred_respawn_role: "cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator review handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not write code.
- Do not modify Contract files. Report to orchestrator if modification is needed.
- Do not execute `cdd advance --commit`.
- Do not ask the orchestrator to fill missing Spec fields in the main session.
