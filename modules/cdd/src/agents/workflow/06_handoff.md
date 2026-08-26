# CDD Handoff Protocol

Follow `00_shared_contract.md` and `01_cdd.md` first.

Command selection: use `mise run build`/`mise run check` only when the consumer has the current generated `mise.toml` and tasks; otherwise use that project's configured equivalent build and check commands.

This document defines the final delivery stage after all reviews and AC verification pass.

## Preconditions

The orchestrator must not trigger handoff until ALL of the following are true:

- All Claims have `status: done`.
- All stage reviews have `status: clean`.
- Integration review has `status: clean`.
- AC verification has passed (or the feature has no ACs by design).
- The selected build and check commands pass at the workspace root.

## Procedure

1. Collect execution evidence from all completed Claims.
2. Collect review traces from all review rounds.
3. Identify contract updates made during this cycle (if any).
4. Identify residual risks or follow-up items discovered during execution.
5. Produce `handoff_bundle`.
6. Present to user in Korean.
7. After user confirms, clean up `tmp/claims/`.

## Bundle format

```yaml
handoff_bundle:
  execution_mode: "team|sub-agent"
  bootstrap_context_summary: "one-line scope summary"
  claims_completed:
    - id: "C-SURFACE-001"
      type: "surface"
      objective: "..."
    - id: "C-TEST-001"
      type: "test"
      objective: "..."
    - id: "C-IMPL-001"
      type: "implement"
      objective: "..."
  files_changed:
    - "path/to/file.ts"
  ac_results:
    total: N
    passed: N
    failed: 0
    skipped: 0 # features with no AC by design
  review_trace:
    surface: "clean (round 1)"
    test: "clean (round 1)"
    implement: "clean (round 2, 1 finding fixed)"
    integration: "clean (round 1)"
  contract_updates:
    - file: "contract/main.contract.md"
      change: "added refund time limit rule"
  residual_risks:
    - "description of any known risk or limitation"
  follow_up_items:
    - "description of future work identified during this cycle"
  validation_evidence:
    build: "pass"
    check: "pass"
    test: "N/N passed"
```

## Presentation format

The handoff is presented to the user as a structured Korean summary:

1. **완료 요약**: what was delivered (from `bootstrap_context_summary`).
2. **변경 파일 목록**: files changed.
3. **AC 결과**: test pass/fail counts.
4. **리뷰 이력**: review rounds and findings resolved.
5. **계약 변경**: contract updates made (if any).
6. **잔여 리스크**: residual risks (if any).
7. **후속 작업**: follow-up items (if any).
