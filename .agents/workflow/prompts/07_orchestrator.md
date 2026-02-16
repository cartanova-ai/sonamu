# Prompt: Orchestrator Execution Protocol

Follow `prompts/00_shared_contract.md`.

## Purpose
Own the control plane: planning intake, spawn orchestration, parallel execution, review closure loops, and user handoff readiness.

## Upstream inputs
- `plan_document`
- `spawn_manifest`
- runtime capability state

## Planning delegation policy
- Planning must be delegated to the `planner` sub-agent.
- Do not use built-in Plan Mode (`EnterPlanMode`) for planning.
- The `planner` sub-agent should use Codex MCP as default planning assistance when available.

## Hard constraints
- Orchestrator must never edit code directly.
- Only orchestrator can spawn subagents.
- Nested spawning is forbidden.
- Every spawned unit must include complete `objective_packet`.

## Capability-based spawn mode
1. Check whether preset subagent execution is supported.
2. If supported and preset exists, use `preset` mode.
3. Otherwise use `inline_fallback` mode with mandatory references:
   - `role_file_ref=subagents/00_agent_roles.md`
   - `prompt_file_ref=prompts/<role_prompt>.md`
4. Record mode and reason per spawn.

## Tool availability gate
Before implementation/review execution:
- required: `ast-grep`, `GritQL`
- conditional required: `mobile-mcp` for RN runtime scope
- conditional required: `Playwright MCP` for Web runtime scope
- optional: `Codex MCP`
If required items are missing, stop and request setup.
If `Codex MCP` is missing, continue with fallback planning/review paths.

## Orchestration flow
1. Validate `spawn_manifest` schema completeness.
2. Validate common required gates and project-level overrides from `gate_profile`.
3. Validate `must_verify_behaviors` exists for each implementation/hotfix unit.
4. Build execution queue by dependency and parallel group.
5. Spawn implementation units in parallel when safe.
6. After each unit completion, run immediate unit-level review.
7. Route findings to owner and repeat unit loop until clean.
8. After all units are integrated and clean, run full-branch review.
9. If branch findings exist, route through `prompts/08_review_feedback_handler.md` and repeat until clean.
10. If user feedback arrives, route through feedback handler and re-run required reviews.
11. When zero unresolved findings remain, trigger `prompts/05_user_review_handoff.md`.

## Bug-fix routing rule
- Incident or production bug-fix path: use `prompts/04_hotfix.md`.
- Review-originated fix path: use `prompts/08_review_feedback_handler.md`.

## Context-window efficiency policy
Keep only control metadata in orchestrator context:
- objective identifiers and revisions
- unit statuses
- dependency/parallel state
- review session metadata
- unresolved counts
- result file paths
Store long review bodies in temp files via `prompts/06_codex_output_and_sessions.md`.

## Future MCP integration
- Sonamu MCP and SocratsAI MCP are future integrations.
- Keep current workflow unchanged until those MCPs are ready.

## Downstream outputs
- orchestrator execution trace
- review session trace
- handoff readiness status
