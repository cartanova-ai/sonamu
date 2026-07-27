---
name: task-inline
description: Implement and self-review a small, local code change without spawning planner, test-writer, implementer, or reviewer agents. Use only when the user explicitly invokes task-inline for a trivial correction that does not require new behavioral tests or independent review.
---

# Task Inline

The main orchestrator performs the work directly. Do not spawn sub-agents.

## Procedure

1. Inspect the target code and applicable repository or framework skills.
2. Implement the smallest direct change.
3. Run existing focused validation when available.
4. Re-read the final diff and check:
   - It matches the requested correction.
   - It contains no unrelated changes.
   - It introduces no obvious runtime or type error.
   - It does not unintentionally change existing behavior.
5. Report changed files, validation, and any unverified risk.

Do not add new tests unless the user explicitly includes test work.

## Escalate to `task`

Stop and ask the user to switch to the normal `task` workflow when the work
reveals:

- New user-visible behavior or an API contract change
- Data persistence, authorization, migration, transaction, or concurrency work
- A regression risk that needs a new test
- A materially larger scope than the user described

Do not silently upgrade or downgrade workflows.
