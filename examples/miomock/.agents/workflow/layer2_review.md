# Layer 2 Semantic Review Backend

Shared contract for the orchestrator-managed semantic review that runs after `cdd advance <spec>` emits a delegate payload.

This review is not generic unit-level diff review. It is a workflow-specific semantic gate for CDD transitions, so the default backend is `Codex MCP`, not the generic local-review default.

## Required reading (mandatory)

- `./cdd.md`
- `./00_cdd_contract.md`
- `../../../../.agents/workflow/prompts/06_codex_output_and_sessions.md`

## Backend policy

- Default backend: `Codex MCP`
- Fallback backend: `cdd-layer2-reviewer`
- The orchestrator selects the backend and preserves the same review contract regardless of backend.
- `Codex MCP` use must follow the inherited progress-file and human-in-the-loop policy.
- The backend is findings-only. It must not edit Specs, code, or tests.

## Input

```yaml
review_backend: "codex_mcp|cdd-layer2-reviewer"
scope_phase: "specifying|implementing|validating"
spec_path: "{spec file path}"
contract_paths: ["{referenced contract paths}"]
schema_path: "{schema file path}"
rules_paths: ["{applicable rules file paths}"]
objective_packet:
  global_objective: "..."
  phase_objective: "..."
  unit_objective: "..."
delegate_payload: "{packet emitted by cdd advance <spec>}"
known_findings: [{ field, severity, message }]
ownership_map:
  narrative_or_schema: "cdd-specifier"
  shared_surface_or_migration: "cdd-surface-scaffolder"
  tests_or_testref: "cdd-test-writer"
  implementation_or_sources: "cdd-implementer"
  validating_stage_code_or_tests: "cdd-validator"
```

## Procedure

### Step 1: Load the review packet

1. Read the Spec, Contract, Schema, and every rule file in `rules_paths`.
2. Read the `delegate_payload` emitted by `cdd advance <spec>`.
3. Treat the packet as the primary review surface. Use the Spec and referenced artifacts only to validate the packet's semantic claims.
4. If any required input is missing or malformed, return `status: blocked`.

### Step 2: Apply phase-specific semantic checks

When `scope_phase=specifying`:
- verify schema-field intent matches field names, types, and descriptions when present
- verify ACs are concrete, testable, and within Contract scope
- verify cross-field consistency and target-feature completeness
- verify all referenced `sources`, `dependsOnSpecs`, and `contracts` were reconciled before the transition

When `scope_phase=implementing`:
- verify code, `sources`, and tests match the confirmed Spec
- verify test mappings are meaningful when `useTestRef=true`
- verify changed files were reconciled against every source-linked Spec plus their `contracts` and `dependsOnSpecs`
- route shared-surface or migration-prerequisite findings to `cdd-surface-scaffolder`

When `scope_phase=validating`:
- verify AC semantics are meaningfully covered by tests when `useTestRef=true`
- verify AC semantics remain observable from implementation evidence when `useTestRef=false`
- verify constraints and error-handling expectations are reflected in the validated code path
- verify no stale Spec or Contract drift is being silently passed through closure

### Step 3: Return findings only

1. Do not patch any artifact.
2. Assign each finding to the owning worker through `owner_role`.
3. Use `contract_drift: true` only when closure is blocked by required Contract changes.
4. Return `status: clean` only when no semantic finding remains.

## Output

```yaml
review_backend: "codex_mcp|cdd-layer2-reviewer"
status: "clean|needs_fix|blocked"
scope_phase: "specifying|implementing|validating"
review_metadata:
  progress_file_path: "{required for codex_mcp or empty}"
  backend_session: "{session id or empty}"
  reused_or_new: "reused|new|not_applicable"
  human_in_the_loop: true|false
findings:
  - id: "L2-001"
    severity: "high|medium"
    owner_role: "cdd-specifier|cdd-surface-scaffolder|cdd-test-writer|cdd-implementer|cdd-validator"
    field: "{summary|schema field|acceptanceCriteria|testRef|sources|constraints|errorHandling|contract}"
    message: "{semantic issue}"
    evidence_refs: ["{paths or payload refs}"]
contract_drift: true|false
user_review_summary: "{brief Korean summary for orchestrator handoff}"
blocking_reason: "{empty when clean or needs_fix}"
```

## Prohibitions

- Do not edit Spec, code, tests, or Contracts.
- Do not run `cdd advance` or `cdd advance --commit`.
- Do not expand the task into implementation or reconciliation work.
- Do not downgrade Contract drift into a normal finding when closure would require a Contract edit.
