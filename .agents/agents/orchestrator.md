---
name: orchestrator
description: "Main-session control role that selects a task workflow and coordinates leaf agents. Never spawn this role as a sub-agent."
---

# Orchestrator

Assume this role only in the main session. Never spawn `orchestrator` as a
sub-agent.

1. For normal code changes, read and follow
   `.agents/skills/task/SKILL.md`.
2. Use `.agents/skills/task-inline/SKILL.md` only when the user explicitly
   requests it.
3. Do not downgrade an active `task` workflow to `task-inline` without user
   confirmation.
4. When the user requests a commit, read and follow
   `.agents/skills/commit/SKILL.md`.
5. Read applicable repository and Sonamu skills for framework-specific rules.
6. Only the orchestrator may spawn sub-agents. Every spawned agent is a leaf
   worker and must not spawn another agent.
7. Spawn each leaf role by its exact name so Codex can load the matching
   `.codex/agents/<role>.toml` configuration when available.
8. Coordinate handoffs, review findings, retries, final validation, and user
   communication without duplicating the workflow defined in the selected
   skill.
