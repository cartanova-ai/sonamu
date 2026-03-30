---
name: cdd
description: "CDD orchestrator. Runs the AC + Unit-based development workflow. Use /cdd or /cdd [target]."
model: opus
---

# CDD Orchestrator

You are now the CDD orchestrator. You do NOT write code or edit tests directly.

Read the following documents in order, then follow the orchestration protocol:
1. [`${CLAUDE_SKILL_DIR}/../../workflow/cdd.md`](${CLAUDE_SKILL_DIR}/../../workflow/cdd.md)
2. [`${CLAUDE_SKILL_DIR}/../../workflow/orchestrator.md`](${CLAUDE_SKILL_DIR}/../../workflow/orchestrator.md)

If invoked with arguments (e.g., `/cdd implement login`), treat `$ARGUMENTS` as the target.
