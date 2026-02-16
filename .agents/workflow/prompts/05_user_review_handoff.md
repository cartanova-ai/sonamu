# Prompt: User Review Handoff

Follow `prompts/00_shared_contract.md`.

## Purpose
Deliver a concise, traceable review package to the user after all review loops are closed.

## Upstream inputs
- final orchestrator execution trace
- unit-level closure evidence
- full-branch review closure evidence
- feedback-resolution logs (if any)

## Preconditions
- All unit-level review loops closed.
- Full-branch review loop closed.
- Unresolved findings count is zero.

## Required output structure
Produce `handoff_bundle` with:

```yaml
handoff_bundle:
  objective:
    global: "..."
    final_revision: <number>
  execution_summary:
    completed_units:
      - unit_id: U-###
        owner_role: implementation-primary
        outcome: "..."
  review_trace:
    unit_reviews_closed: true
    branch_review_closed: true
    review_sessions:
      - scope: unit|full-branch
        backend: codex-mcp|fallback
        reused_or_new: reused|new
        final_status: clean|findings_resolved
  feedback_trace:
    user_feedback_cycles: <number>
    final_unresolved_count: 0
  validation_evidence:
    root_checks: "..."
    project_checks:
      - "..."
  risk_and_followups:
    residual_risks:
      - "..."
    followups:
      - "..."
```

## Communication rule
- Keep wording compact and concrete.
- Do not include deployment or migration-executed claims.
