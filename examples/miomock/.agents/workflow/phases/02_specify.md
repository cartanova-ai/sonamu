# Phase 2: Specify / Reconcile Spec

Refine the Spec until it is ready to enter `implementing`, or reconcile Spec content when later-phase work reveals documentation drift. This phase owns Spec content edits for both the normal specifying transitions and later-phase artifact reconciliation.

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
3. Apply every rule that matches the current task and Spec-authoring scope.
4. If a required rule file is missing, unreadable, or malformed, stop and return `ready_for_transition: false` with `blocking_reason`.

### Step 2: Review current state

1. Read the Spec file and record the current status.
2. Read every existing file path referenced in `sources`; if a listed path does not exist yet, note that it still needs planned-only review rather than live-file inspection.
3. Read the referenced Contract files from the Spec `contracts` array.
4. Read any related Spec files listed in `dependsOnSpecs`.
5. Read the Schema file and identify all required custom fields.
6. If the current status is `draft` or `specifying`, continue in transition mode.
7. If the current status is `implementing`, `validating`, or `done`, continue in artifact-reconciliation mode: preserve the current `status` and reconcile Spec content only.
8. For feature-change requests or later-phase follow-up, decide whether the target Spec needs modification, additional content, or no change before touching related artifacts.

### Step 3: Normalize metadata and fill the core narrative

1. Preserve the current `schemaVersion` if it already exists.
2. If `schemaVersion` is missing after scaffold creation, initialize it to `2` for the current live Spec envelope.
3. If `useTestRef` is missing, initialize it to `true`.
4. Set `useTestRef=false` only for exceptional Specs, such as FE/web flows that intentionally do not use acceptance-test ownership in this workflow.
5. Refresh `lastModified` to today's `YYYY-MM-DD` whenever you change the Spec in this phase.
4. Write or refine the Spec's:
   - `summary`
   - `description`

The narrative must stay within the referenced Contract scope and clearly describe one feature.

### Step 4: Fill schema-defined fields

Read the Schema `fields` array and fill each field according to its `name`, `type`, and `description` when present.

Each field must:
- stay within Contract scope
- be consistent with `summary` and `description`
- maintain consistency across cross-references between fields
- accurately reflect the field's intended role from its name/type and any description that exists

### Step 5: Define acceptance criteria

1. Derive verifiable conditions from Contract `businessRules` and `edgeCases`.
2. Derive additional conditions from schema fields such as error handling and constraints.
3. Write each AC directly in `acceptanceCriteria`.
4. `condition` must be concrete and pass/fail verifiable.
5. When `useTestRef=true`, leave `testRef.target` and `testRef.pattern` empty at this phase. Those are filled later by `cdd-test-writer` during `implementing`.
6. When `useTestRef=false`, keep `testRef` empty and make sure the AC wording is concrete enough to be validated directly against the implementation without test mapping.

### Step 6: Plan implementation sources

Add or refine planned implementation and test file paths in `sources` when they are knowable at Spec time or when later-phase reconciliation shows the documented file layout has drifted from the confirmed implementation.
These are handoff hints for the parallel `implementing` workers; `cdd-implementer` still owns the final actual `sources` list.
When the feature will require new shared types, interfaces, exports, DTO/schema files, or runtime entrypoints, make the planned file layout concrete enough that the orchestrator can tell whether `cdd-surface-scaffolder` should run before the parallel pair.
When running in artifact-reconciliation mode, compare the current `sources` entries to the confirmed implementation/test layout and reconcile only the documented plan, not the ownership boundary.

### Step 7: Fix findings on re-spawn

If `findings` are provided:
1. Check each finding's `field` and `message`.
2. Fix the corresponding Spec content.
3. Prioritize `severity: error` items.

### Step 8: Review related artifact impact and later-phase drift

1. Treat feature-change requests and later-phase drift follow-up as target-Spec-first work: update or extend the target Spec before deciding any downstream follow-up.
2. Re-check every document path referenced in the current `sources`, then the target Spec's `contracts` and `dependsOnSpecs` after your edits.
3. Confirm whether any referenced source path, Contract, or related Spec contradicts the target Spec narrative, ACs, schema-defined fields, constraints, or planned file layout.
4. If a referenced `sources` path is stale, missing beyond planned intent, or semantically inconsistent, reconcile the target Spec before closing.
5. If implementation changed actual file layout, exported surface, documented constraints, or documented behavior, reconcile the target Spec to the confirmed implementation before closing.
6. If consistency requires related Spec edits, update those related Specs within `cdd-specifier` scope and track them in `related_spec_updates`.
7. If a related artifact review reveals contract drift, do not edit the Contract unless the user explicitly requested Contract changes.
8. When contract drift blocks closure, return `ready_for_transition: false` and report `blocking_reason`.

### Step 9: Run the pre-commit transition check

1. If the current status is `draft` or `specifying`, run `cdd advance <spec>` without `--commit`.
2. If the current status is `implementing`, `validating`, or `done`, skip the transition check and preserve the current `status`.
3. If Layer 1 fails because required Spec content is still missing or malformed, fix the Spec and re-run the command.
4. If the CLI emits delegate output, stop the self-loop and return that Layer 2 packet to the orchestrator.
5. Do not consume the delegate payload inside this worker. The orchestrator-managed backend performs Layer 2 review.
6. If you determine that the Contract must change, stop and return `ready_for_transition: false`.

### Step 10: Return transition readiness

Return `ready_for_transition: true` only when the current status is `draft` or `specifying` and:
- `summary` and `description` are coherent
- `schemaVersion` and `lastModified` are valid
- `useTestRef` is set correctly for the intended workflow
- required schema fields are filled
- ACs are concrete and non-empty
- planned `sources` are coherent enough for downstream work, including any likely shared-surface or migration-prerequisite scaffold
- every referenced document in `sources`, `dependsOnSpecs`, and `contracts` is reviewed for consistency, with required Spec follow-up applied or explicitly routed
- related Specs are updated or explicitly routed for follow-up
- the latest `cdd advance <spec>` Layer 1 check is clean for the current transition
- the delegate payload from `cdd advance <spec>` is attached for orchestrator-managed Layer 2 review

Return `ready_for_layer2_review: true` only when the current status is `draft` or `specifying` and the latest `cdd advance <spec>` run produced a delegate payload after a clean Layer 1 result.

Return `artifact_reconciliation_complete: true` only when the current status is `implementing`, `validating`, or `done` and:
- the target Spec is reconciled against current `sources`
- every referenced document in `sources`, `dependsOnSpecs`, and `contracts` is reviewed for consistency, with required Spec follow-up applied or explicitly routed
- related Specs are updated or explicitly routed for follow-up
- the current `status` is preserved
- any Contract drift is reported instead of silently ignored

## Output

```yaml
spec_path: "{spec file path}"
rules_reviewed: ["{rule ids read from rules_paths}"]
current_status: "draft|specifying|implementing|validating|done"
transition_readiness:
  checked_with: "cdd advance <spec>|not_run"
  layer1_result: "pass|fail|not_run"
  layer2_result: "pending|not_run"
artifact_reconciliation_complete: true|false
metadata_updated: ["{list such as schemaVersion,lastModified}"]
fields_completed: ["{list of filled fields}"]
ac_count: "{number of defined ACs}"
sources_planned: ["{list of planned source files}"]
target_spec_assessment:
  action: "modify|extend|no_change"
  rationale: "{why the target Spec did or did not need updates}"
related_artifacts_reviewed:
  sources: ["{sources paths reviewed}"]
  contracts: ["{contract paths reviewed}"]
  dependsOnSpecs: ["{related spec paths reviewed}"]
  missing_source_paths: ["{planned source paths that do not exist yet but were still checked for consistency}"]
related_spec_updates: ["{related spec paths updated}"]
related_spec_followups: ["{related spec paths that still need follow-up}"]
contract_drift: true|false
ready_for_transition: true|false
ready_for_layer2_review: true|false
delegate_payload: "{delegate payload emitted by cdd advance, or empty when not emitted}"
preferred_respawn_role: "cdd-specifier"
user_review_summary: "{brief Korean summary for orchestrator review handoff}"
blocking_reason: "{empty when ready}"
```

## Prohibitions

- Do not write code.
- Do not modify Contract files. Report to orchestrator if modification is needed.
- Do not execute `cdd advance --commit`.
- Do not ask the orchestrator to fill missing Spec fields in the main session.
- Do not consume the Layer 2 delegate payload inside this worker. Return it to the orchestrator unchanged.
- In artifact-reconciliation mode, do not change the current `status` or absorb code/test work from later phases.
