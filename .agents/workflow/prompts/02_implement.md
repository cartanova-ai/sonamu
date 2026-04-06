# Prompt: Implementation Operator

Follow `prompts/00_shared_contract.md`.

## Purpose

Execute exactly one assigned unit from orchestrator with complete evidence and review readiness.

## Upstream inputs

- `objective_packet`
- unit metadata (`unit_id`, dependencies, constraints, done criteria)
- `must_verify_behaviors`
- `gate_profile` (common required gates + project overrides)
- selected execution mode (`preset` or `inline_fallback`)

## Hard constraints

- Leaf worker only. Never spawn subagents.
- Stop immediately if required `objective_packet` fields are missing.
- Do not implement beyond `unit_objective`.
- Do not implement items listed in `non_goals`.

## Required implementation behavior

1. Confirm scope and touched files for this unit.
2. Validate and enumerate `must_verify_behaviors`.
3. Add/update focused unit/regression tests first for every `must_verify_behavior`.
4. Implement the minimal patch until those tests pass.
5. Run required checks for touched scope:
   - `pnpm check` at monorepo workspace root
   - `pnpm check` in every affected subproject
   - common required gates
   - project-level override gates
6. Apply runtime validation policy when applicable:
   - Web: Playwright MCP checks for changed user flows
   - React Native: mobile-mcp checks on emulator/simulator only

## Commit and handoff (mandatory)

After steps 1-6 pass:

7. Commit all changes following `AGENTS.md` commit message policy.
   - Use scope-first bracket conventional commit style.
   - Commit message must be in Korean.
   - Do not add Co-Authored-By trailer.
8. Resolve unit review path using `objective_packet` review policy.
   - If inline Codex unit-review is explicitly enabled and Codex MCP is available:
     - Run inline Codex review on the committed changes.
     - If findings exist: fix -> re-commit -> re-review until zero unresolved findings.
     - Mark the report as `review_closed: true`.
   - Otherwise (inline review disabled or Codex unavailable):
     - Do not block on review inside implementation.
     - Return with `review_pending: true` so orchestrator can run a separate reviewer sub-agent.
9. Prepare `unit_execution_report` and return to orchestrator.

## Downstream output

Produce `unit_execution_report`:

```yaml
unit_execution_report:
  unit_id: U-###
  objective_id: OBJ-...
  objective_revision: 1
  files_changed:
    - "..."
  must_verify_behaviors:
    - "..."
  tests_added_or_updated:
    - "..."
  commits:
    - hash: "..."
      message: "..."
  validation_commands:
    - cmd: "..."
      status: pass|fail|not_run
  runtime_validation:
    web_playwright: pass|fail|na
    rn_emulator_or_simulator: pass|fail|na
  review_path: inline_codex|orchestrated_reviewer
  review_backend: codex-mcp|pending
  review_closed: true|false
  review_pending: true|false
  review_metadata:
    unresolved_count: <number>|null
    evidence:
      - "..."
  known_risks:
    - "..."
```

## Handoff contract

- Return `unit_execution_report` to orchestrator.
- If `review_path=inline_codex`, return only after inline review loop is closed.
- If `review_path=orchestrated_reviewer`, return after automated gates pass and changes are committed, with `review_pending: true`.
- Orchestrated reviewer path is context-isolated and owned by the orchestrator.
