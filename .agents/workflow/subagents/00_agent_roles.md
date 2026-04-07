# Agent Role Map (Integrated)

This file defines role behavior, canonical prompts, and mode-specific dispatch references.

## Dispatch modes
- `preset`: use `.agents/agents/<role>.md` (Claude-compatible preset path via `.claude/agents`).
- `inline_fallback`: use this role map + canonical prompt file reference.

## Topology constraint
Only the main agent can spawn sub-agents. The orchestrator role is always assumed by the main agent, never spawned as a sub-agent. All other roles are spawnable leaf workers.

---

## Main agent role (not spawnable)

### `orchestrator`
- Canonical prompt: `.agents/workflow/prompts/07_orchestrator.md`
- Role-assumption file: `.agents/agents/orchestrator.md`
- Input artifacts: `plan_document`, `spawn_manifest`
- Output artifacts: execution trace, review trace, handoff readiness
- Rule: never edit code, always runs as the main agent
- The main agent reads the role-assumption file and canonical prompt to become the orchestrator. It is never dispatched via `preset` or `inline_fallback` spawn.

---

## Spawnable sub-agent roles (leaf workers)

### `planner`
- Canonical prompt: `.agents/workflow/prompts/01_plan.md`
- Preset file: `.agents/agents/planner.md`
- Input artifacts: `bootstrap_context`, spec
- Output artifacts: `plan_document`, `spawn_manifest`
- Rule: no implementation edits, no nested spawn

### `implementation-primary`
- Canonical prompt: `.agents/workflow/prompts/02_implement.md`
- Preset file: `.agents/agents/implementation-primary.md`
- Input artifacts: `objective_packet`, unit metadata
- Output artifacts: `unit_execution_report`
- Rule: leaf worker, no nested spawn, must commit and return `unit_execution_report`; if inline Codex unit-review is explicitly enabled and available, may close unit review before returning

### `reviewer`
- Canonical prompt: `.agents/workflow/prompts/06_codex_output_and_sessions.md`
- Preset file: `.agents/agents/reviewer.md`
- Input artifacts: git diff, `must_verify_behaviors`, gate results, `objective_packet` subset
- Output artifacts: `unit_review_result` or `branch_review_result`, `review_metadata`
- Rule: context-isolated (receives only diff and requirements, not implementation reasoning)
- Rule: follows structured review checklist (see local reviewer review contract in canonical prompt)
- Rule: prioritize bugs -> requirement conformance -> performance/security
- Rule: severity-gated (high and medium only, no style nitpicks)
- Scope: unit-level and full-branch reviews (orchestrator-spawned). Backend default is local reviewer for unit-level and Codex MCP (fallback local reviewer) for full-branch.

### `review-feedback-handler`
- Canonical prompt: `.agents/workflow/prompts/08_review_feedback_handler.md`
- Preset file: `.agents/agents/review-feedback-handler.md`
- Input artifacts: findings, objective revision
- Output artifacts: `feedback_resolution_log`
- Rule: leaf worker, route fixes then re-review

### `handoff`
- Canonical prompt: `.agents/workflow/prompts/05_user_review_handoff.md`
- Preset file: `.agents/agents/handoff.md`
- Input artifacts: closure traces and evidence
- Output artifacts: `handoff_bundle`
- Rule: concise, traceable, no deployment/migration execution claims

---

## Hotfix routing
- Use `.agents/workflow/prompts/04_hotfix.md` with the same role map and closure loops.
