# Prompt: Orchestrator Execution Protocol

Follow `prompts/00_shared_contract.md`.

## Purpose
Own the control plane: planning intake, spawn orchestration, parallel execution, review closure loops, and user handoff readiness.

## Topology constraint
The orchestrator role must be assumed by the main agent (top-level conversation), not spawned as a sub-agent. This is a hard runtime constraint: only the main agent can use the Task tool to spawn sub-agents. If the orchestrator were spawned as a sub-agent, it would be unable to spawn further sub-agents and the workflow would fail.

When assuming this role, the main agent reads this file and `.agents/agents/orchestrator.md`, then operates as the orchestrator for the remainder of the task.

## Upstream inputs
- `plan_document`
- `spawn_manifest`
- runtime capability state

## Hard constraints
- Orchestrator must never edit code directly.
- Only the main agent (acting as orchestrator) can spawn sub-agents.
- Nested spawning is forbidden. All spawned sub-agents are leaf workers.
- Every spawned unit must include complete `objective_packet`.

## Capability-based spawn mode
1. Check whether preset subagent execution is supported.
2. If supported and preset exists, use `preset` mode.
3. Otherwise use `inline_fallback` mode with mandatory references:
   - `role_file_ref=.agents/workflow/subagents/00_agent_roles.md`
   - `prompt_file_ref=.agents/workflow/prompts/<role_prompt>.md`
4. Record mode and reason per spawn.

## Tool availability gate
Before implementation/review execution:
- required: `ast-grep`, `GritQL`
- conditional required: `mobile-mcp` for RN runtime scope
- conditional required: `Playwright MCP` for Web runtime scope
- optional: `Codex MCP`
If required items are missing, stop and request setup.
If `Codex MCP` is missing, continue without Codex MCP and use fallback planning/review paths.

## Orchestration flow
1. Validate `spawn_manifest` schema completeness.
2. Validate common required gates and project-level overrides from `gate_profile`.
3. Validate `must_verify_behaviors` is present for each implementation/hotfix unit.
4. Build execution queue by dependency and parallel group.
5. Spawn implementation units in parallel when safe.
6. Each implementation sub-agent handles: implement -> automated gates -> commit -> return.
7. When a unit sub-agent returns, verify its `unit_execution_report` and check review fast-path eligibility (see `prompts/06_codex_output_and_sessions.md` Review fast-path policy).
8. Unit-level review loop:
   a. If fast-path conditions are met, skip reviewer spawn and mark review as closed.
   b. Otherwise, spawn a local reviewer sub-agent with context isolation (diff, `must_verify_behaviors`, gate results only). Follow the local reviewer review contract in `prompts/06_codex_output_and_sessions.md`.
   c. If reviewer returns findings, spawn review-feedback-handler to fix, then re-spawn reviewer.
   d. Repeat until zero unresolved findings.
9. After all units are reviewed and clean, spawn a Codex MCP review for the full branch (final quality gate). Follow session and human-in-the-loop policies in `prompts/06_codex_output_and_sessions.md`.
10. If branch findings exist, route through `prompts/08_review_feedback_handler.md` and repeat until clean.
11. If user feedback arrives, route through feedback handler and re-run required reviews.
12. When zero unresolved findings remain, trigger `prompts/05_user_review_handoff.md`.

## Bug-fix routing rule
- Incident or production bug-fix path: use `prompts/04_hotfix.md`.
- Review-originated fix path: use `prompts/08_review_feedback_handler.md`.

## Hotfix escalation configuration
When spawning hotfix units, include the following in `objective_packet`:
- `max_self_attempts`: Maximum number of self-fix attempts before full Codex MCP delegation (default: 3). Adjust based on bug complexity and severity.
- `autonomous`: Whether the sub-agent may escalate to Codex MCP without user confirmation (`true` for autonomous mode, `false` for normal mode). Set based on user preference or task context.

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
