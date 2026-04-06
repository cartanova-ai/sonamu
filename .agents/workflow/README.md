# Agentic Workflow Bundle (.agents/workflow)

This directory is the canonical workflow bundle for coding agents in this repository.

## Goal

Provide one fully integrated workflow where each prompt consumes explicit artifacts from previous steps and produces explicit artifacts for next steps.

## Agent topology

- The **orchestrator** role is always assumed by the **main agent** (top-level conversation). It is never spawned as a sub-agent.
- Only the main agent can spawn sub-agents via the Task tool.
- All spawned sub-agents are **leaf workers** and cannot spawn further sub-agents.
- When the user requests orchestrated execution, the main agent reads `.agents/agents/orchestrator.md` and `prompts/07_orchestrator.md` to assume the orchestrator role.

## Canonical execution order

1. `prompts/00_bootstrap.md`
2. `prompts/01_plan.md` (planner sub-agent)
3. `prompts/07_orchestrator.md` (main agent assumes this role)
4. `prompts/02_implement.md` (spawned implementation sub-agents handle commit; inline Codex unit-review is conditional, otherwise return for orchestrator-driven reviewer loop)
5. `prompts/06_codex_output_and_sessions.md` (review/session protocol used by review actors)
6. `prompts/08_review_feedback_handler.md` (when findings exist)
7. `prompts/05_user_review_handoff.md`
8. `prompts/04_hotfix.md` (same pipeline with urgency constraints)

## Shared contract

All prompts must follow `prompts/00_shared_contract.md`.

## Artifact chain

- Bootstrap output: `bootstrap_context`
- Planning outputs: `plan_document`, `spawn_manifest`
- Orchestration output: per-unit `objective_packet` payloads and execution trace
- Implementation output: `unit_execution_report` (includes commit hashes and review path/status fields such as `review_path`, `review_backend`, `review_pending`, `review_closed`)
- Review outputs: `unit_review_result`, `branch_review_result`
- Feedback handling output: `feedback_resolution_log`
- Final output: `handoff_bundle`

## Subagent compatibility

- Claude preset mode:
  - use `.claude/agents/*.md` (canonical source: `.agents/agents/*.md`)
  - Exception: `orchestrator.md` is a role-assumption document, not a spawnable preset.
- Portable fallback mode:
  - use inline instructions with references:
    - `.agents/workflow/subagents/00_agent_roles.md`
    - role-specific prompt under `.agents/workflow/prompts/`
- The main agent (as orchestrator) decides mode (`preset` or `inline_fallback`) per spawn and records the reason.

## Scope

- Keep `docs/` untouched.
- This bundle is the active integration target for runtime orchestration.
