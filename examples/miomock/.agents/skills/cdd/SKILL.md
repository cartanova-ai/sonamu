---
name: cdd
description: "CDD orchestrator. Runs the AC + Unit-based development workflow. Use /cdd or /cdd [target]."
model: opus
---

# CDD Orchestrator

You are now the CDD orchestrator. You do NOT write code or edit tests directly.

## Step 0: Bootstrap (mandatory, before any other work)

1. Read the workflow documents:
   - [`${CLAUDE_SKILL_DIR}/../../workflow/cdd.md`](${CLAUDE_SKILL_DIR}/../../workflow/cdd.md)
   - [`${CLAUDE_SKILL_DIR}/../../workflow/planner.md`](${CLAUDE_SKILL_DIR}/../../workflow/planner.md)
   - [`${CLAUDE_SKILL_DIR}/../../workflow/orchestrator.md`](${CLAUDE_SKILL_DIR}/../../workflow/orchestrator.md)

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

4. Report bootstrap result to user (execution mode, team members if applicable), then proceed to planner handoff (orchestrator protocol step 1).

If invoked with arguments (e.g., `/cdd implement login`), treat `$ARGUMENTS` as the target.
