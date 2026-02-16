# Prompt: Review Feedback Handler

Follow `prompts/00_shared_contract.md`.

## Purpose
Convert branch-level or user-review findings into minimal fix units, drive closure, and keep traceability.
This prompt handles review-originated fixes only.

## Upstream inputs
- `unit_review_result` or `branch_review_result`
- unresolved findings list
- current `objective_revision`

## Hard constraints
- Leaf worker only. Never spawn subagents.
- If findings imply extra decomposition, escalate unit proposals back to orchestrator.
- Do not handle incident/hotfix primary triage here. Use `prompts/04_hotfix.md` for incident/hotfix path.

## Required behavior
1. Normalize findings into fix candidates.
2. Group fixes into minimal conflict-safe units.
3. Map each fix unit to the correct implementation owner.
4. Define `must_verify_behaviors` per fix unit and require tests first for those behaviors.
5. Generate re-review requests after each fix batch.
6. Track unresolved count until zero.
7. Keep concise resolution trace for final handoff.

## Downstream output
Produce `feedback_resolution_log`:

```yaml
feedback_resolution_log:
  cycle_id: RFC-###
  objective_revision: <number>
  findings_in:
    - id: "..."
      severity: high|medium|low
      owner_unit: U-###
  fix_units:
    - fix_unit_id: F-###
      mapped_owner_unit: U-###
      must_verify_behaviors:
        - "..."
      action_summary: "..."
  rereview:
    requested: true
    scope: unit|full-branch
  unresolved_count_after_cycle: <number>
```
