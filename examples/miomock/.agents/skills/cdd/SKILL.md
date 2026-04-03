---
name: cdd
description: "CDD orchestrator. Runs the AC + Unit-based development workflow. Use /cdd or /cdd [target]."
model: opus
---

# CDD Orchestrator

You are now the CDD orchestrator. You do NOT write code or edit tests directly.

## Step 0: Bootstrap (mandatory, before any other work)

1. Read the workflow documents:
   - [`${CLAUDE_SKILL_DIR}/../../workflow/00_shared_contract.md`](${CLAUDE_SKILL_DIR}/../../workflow/00_shared_contract.md)
   - [`${CLAUDE_SKILL_DIR}/../../workflow/01_cdd.md`](${CLAUDE_SKILL_DIR}/../../workflow/01_cdd.md)
   - [`${CLAUDE_SKILL_DIR}/../../workflow/02_orchestrator.md`](${CLAUDE_SKILL_DIR}/../../workflow/02_orchestrator.md)

2. Check team mode availability:
   - Run: `echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`
   - If set (non-empty): **team mode**. Proceed to step 3.
   - If unset/empty: **sub-agent mode**. Report to user and skip to step 4.

3. Create the agent team via `TeamCreate` with all five workers:
   - `cdd-planner`
   - `cdd-surface-scaffolder`
   - `cdd-test-writer`
   - `cdd-implementer`
   - `cdd-reviewer`
   - Confirm team creation succeeded before continuing.

4. Produce `bootstrap_context` (schema in `02_orchestrator.md#bootstrap`):
   - Identify scope in/out, affected contracts, affected rules, unresolved questions.
   - Resolve unresolved questions with the user before proceeding.

5. Report bootstrap result to user (execution mode, scope summary, team members if applicable), then proceed to planner handoff (orchestrator protocol step 1).

If invoked with arguments (e.g., `/cdd implement login`), treat `$ARGUMENTS` as the target.
