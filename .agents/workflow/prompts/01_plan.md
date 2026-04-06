# Prompt: Plan-First Execution Plan

Follow `prompts/00_shared_contract.md`.

## Purpose

Convert `bootstrap_context` into a detailed execution plan and a machine-readable spawn manifest.

## Upstream inputs

- `bootstrap_context` from `prompts/00_bootstrap.md`
- Specification source
- Repo constraints and package-level AGENTS scope rules

## Required planning behavior

1. Validate that `bootstrap_context.unresolved_questions_count == 0`.
2. Build a dependency-aware unit graph with commit-safe, non-overlapping units.
3. Explicitly map:
   - predecessors
   - parallelizable groups
   - merge-risk surfaces
4. Include mandatory validation matrix:
   - monorepo root lint/format via `pnpm check`
   - affected subproject Biome checks via `pnpm check`
   - project-level build/test targets
5. For backend/library units, include regression tests for non-obvious failure-prone behavior.
6. For every unit, define `must_verify_behaviors` that must be validated with tests first.
7. Enforce common required gates and explicit project-level override mapping.
8. Treat planning, codex execution protocol, branch review, and orchestration as prompt-based contracts (not separate skills).
9. Use Codex MCP as the default planning assistance tool. If Codex MCP is unavailable or encounters errors, proceed without it.
10. When Codex MCP returns a response during planning:
    - Normal mode (`autonomous: false`): present the response to the user, wait for user input, then reply via `codex-reply`.
    - Autonomous mode (`autonomous: true`): process and reply automatically via `codex-reply` without user mediation.
11. Sonamu MCP and SocratsAI MCP are future integrations; mark as pending and do not block current planning.
12. Include execution-mode matrix for subagents:

- `preset` (Claude preset available)
- `inline_fallback` (portable mode)

13. Include review loop plan:

- per-unit review/fix loop
- post-integration branch review/fix loop
- user-review feedback loop via feedback handler

14. Route bug-fix work by source:

- incident/hotfix path -> `prompts/04_hotfix.md`
- review-originated fixes -> `prompts/08_review_feedback_handler.md`

## Spawn manifest contract

For each unit, include:

```yaml
- unit_id: U-###
  owner_role: implementation-primary|reviewer|review-feedback-handler|handoff
  model_hint: opus|sonnet|haiku
  spawn_authority: orchestrator_only
  nested_spawn: forbidden
  escalation_path: return_to_orchestrator
  execution_mode_candidates:
    preset:
      preset_name: "..."
      preset_file: ".agents/agents/<role>.md"
    inline_fallback:
      role_file_ref: ".agents/workflow/subagents/00_agent_roles.md"
      prompt_file_ref: ".agents/workflow/prompts/<file>.md"
  objective_packet:
    objective_id: OBJ-...
    objective_revision: 1
    global_objective: "..."
    phase_objective: "..."
    unit_objective: "..."
    non_goals:
      - "..."
    success_criteria:
      - "..."
    constraints:
      - "..."
    required_evidence:
      - "..."
  must_verify_behaviors:
    - "..."
  gate_profile:
    common_required:
      - root_lint
      - root_format
      - root_pnpm_check
      - affected_subproject_pnpm_check
      - project_build
      - project_test
    project_overrides:
      <project_path>:
        required:
          - "..."
        optional:
          - "..."
  dependencies:
    - U-...
  parallel_group: P-...
  required_tools:
    - "..."
  required_skills:
    - "..."
  review_scope: unit|full-branch
  done_criteria:
    - "..."
```

## Downstream outputs

- `plan_document`
- `spawn_manifest`

## Handoff contract

- Pass `plan_document` + `spawn_manifest` to `prompts/07_orchestrator.md`.
