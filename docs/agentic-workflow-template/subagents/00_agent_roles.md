# Subagent Role Map (Integrated)

This file defines role behavior, canonical prompts, and mode-specific dispatch references.

## Dispatch modes
- `preset`: use `.agents/agents/<role>.md` (Claude-compatible preset path via `.claude/agents`).
- `inline_fallback`: use this role map + canonical prompt file reference.

## `orchestrator`
- Canonical prompt: `prompts/07_orchestrator.md`
- Input artifacts: `plan_document`, `spawn_manifest`
- Output artifacts: execution trace, review trace, handoff readiness
- Rule: never edit code

## `planner`
- Canonical prompt: `prompts/01_plan.md`
- Input artifacts: `bootstrap_context`, spec
- Output artifacts: `plan_document`, `spawn_manifest`
- Rule: no implementation edits

## `implementation-primary`
- Canonical prompt: `prompts/02_implement.md`
- Input artifacts: `objective_packet`, `must_verify_behaviors`, `gate_profile`, unit metadata
- Output artifacts: `unit_execution_report`
- Rule: leaf worker, no nested spawn

## `reviewer`
- Canonical prompt: `prompts/06_codex_output_and_sessions.md`
- Input artifacts: review request payload, target refs
- Output artifacts: `unit_review_result` or `branch_review_result`, `review_metadata`
- Rule: prioritize bugs -> requirement conformance -> performance/security

## `review-feedback-handler`
- Canonical prompt: `prompts/08_review_feedback_handler.md`
- Input artifacts: findings, objective revision
- Output artifacts: `feedback_resolution_log`
- Rule: leaf worker, review-originated fixes only

## `handoff`
- Canonical prompt: `prompts/05_user_review_handoff.md`
- Input artifacts: closure traces and evidence
- Output artifacts: `handoff_bundle`
- Rule: concise, traceable, no deployment/migration execution claims

## Bug-fix routing
- Incident/hotfix fixes: `prompts/04_hotfix.md`
- Review-originated fixes: `prompts/08_review_feedback_handler.md`

## Notes
- Planning/Codex execution/branch review/orchestration are prompt-based contracts.
- Codex MCP is conditional (available -> use, unavailable -> fallback).
- Sonamu MCP and SocratsAI MCP are future integrations.
