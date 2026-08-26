# CDD Review Protocol

Follow `00_shared_contract.md` and `01_cdd.md` first.

Command selection: use `mise run build`/`mise run check` only when the consumer has the current generated `mise.toml` and tasks; otherwise use that project's configured equivalent build and check commands.

This document defines the canonical review protocol for all CDD review sessions.

## Review modes

### `review_scope: unit` — Stage-level review

Runs after each stage (surface / test / implement) completes. Review only the files changed by that stage's Claims.

### `review_scope: integration` — Final integration review

Runs after all stage-level reviews pass. Reviews the full set of changed files across all Claims for cross-cutting concerns.

## Priority order (mandatory)

All reviews follow this priority:

1. **Bugs**: logic errors, runtime failures, data corruption risks.
2. **Requirement conformance**: AC satisfaction, contract compliance, rules compliance.
3. **Performance / security risk**: regressions, vulnerabilities, resource leaks.

Only `high` and `medium` severity findings are actionable. `low` findings are informational and do not block progress.

## Stage-specific checklists

### Surface review

| Priority | Check                                                                                                |
| -------- | ---------------------------------------------------------------------------------------------------- |
| high     | Required migration/scaffolding/sync work used Sonamu CLI when the task required it                   |
| high     | Shared types/interfaces are correct and consistent with the contract                                 |
| high     | No business logic or test code in surface files                                                      |
| high     | Migration files are safe (no data loss, reversible when possible)                                    |
| high     | Surface outputs leave downstream-ready model/frame/runtime prerequisites for test and implement work |
| medium   | Worker evidence matches the changed files and generated/scaffolded targets                           |
| medium   | Exports are minimal — only what downstream consumers need                                            |
| medium   | Naming follows project conventions                                                                   |

### Test review

| Priority | Check                                                                        |
| -------- | ---------------------------------------------------------------------------- |
| high     | Every AC in `ac_targets` has a corresponding test with meaningful assertions |
| high     | No vacuous assertions (e.g. `expect(true).toBe(true)`)                       |
| high     | No production code changes                                                   |
| medium   | Tests are isolated — no implicit dependency on execution order               |
| medium   | Test data setup is minimal and clearly tied to the AC being tested           |

### Implement review

| Priority | Check                                                                  |
| -------- | ---------------------------------------------------------------------- |
| high     | `as any` and `as unknown as T` are absent                              |
| high     | Rules compliance (every applicable rule checked)                       |
| high     | Ownership boundary respected — no test file edits                      |
| high     | AC logic is correct — implementation satisfies the acceptance criteria |
| medium   | Error handling preserves root cause with actionable context            |
| medium   | No unnecessary abstractions or over-engineering                        |

### Integration review

| Priority | Check                                                                    |
| -------- | ------------------------------------------------------------------------ |
| high     | Cross-module type consistency (surface types match implementation usage) |
| high     | No circular dependencies introduced                                      |
| high     | Contract compliance — implementation matches business logic docs         |
| medium   | Shared interface changes are reflected in all consumers                  |
| medium   | No duplicate logic across Claims                                         |

## Fast-path

Stage reviews may be skipped when ALL of the following are true:

- Total changed lines <= 30.
- Changes are docs, formatting, or config only.
- All selected build and check verification gates pass.

The orchestrator decides fast-path eligibility. The reviewer does not self-skip.

## Output format

```yaml
review_result:
  review_scope: "unit|integration"
  stage: "surface|test|implement|all"
  status: "clean|needs_fix"
  findings:
    - claim_id: "C-001"
      severity: "high|medium"
      file: "path/to/file.ts"
      line: 42
      check: "checklist item that failed"
      message: "issue description"
      suggested_fix: "brief fix direction (optional)"
  summary: "one-line overall assessment"
```

## Feedback loop protocol

When `status: needs_fix`, the orchestrator handles the feedback loop (defined in `02_orchestrator.md#feedback-loop`):

1. Orchestrator classifies findings by severity and owning Claim.
2. Orchestrator appends findings to the Claim's `findings` field.
3. Owning worker is re-dispatched with updated Claim.
4. After fix, the same review scope/stage is re-run.
5. Repeat until `status: clean` or 3-attempt escalation.

The reviewer does not directly communicate with workers. All feedback flows through the orchestrator.
