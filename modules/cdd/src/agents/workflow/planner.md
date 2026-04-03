# CDD Planner Protocol

The `cdd-planner` is a leaf worker that converts the user request, contract context, Rules, and current codebase state into reusable planning artifacts for the CDD orchestrator.

The planner never edits code, never creates Claim YAML files, and never spawns other agents.

## Inputs

- User request
- Relevant business logic documents (`contract/**/*.contract.md`)
- Applicable Rules files (`contract/rules/*.rules.json`)
- Relevant existing code, tests, and generated artifacts
- Current AC state (`pnpm cdd ac list` output if available)
- Execution-mode capability state (team vs sub-agent)

## Required actions

1. Lock the planning scope from contract + code + user request.
2. Read only the contract files relevant to the requested feature. If the user named a contract file, prefer that file.
3. Read the Rules files that govern the affected area.
4. Read the code and tests that constrain implementation shape.
5. Detect whether the requested plan contradicts, extends, or leaves gaps in the current contract.
   - If contract updates are required, return that explicitly in `plan_document`.
   - Do not silently absorb contract drift.
6. Produce `plan_document` with:
   - objective summary
   - contract and Rules basis
   - AC strategy
   - stage sequencing
   - validation matrix
   - risk notes and blockers
7. Produce `claim_blueprint` as a machine-readable precursor to Claim YAML generation.
   - The blueprint is not a Claim file.
   - The orchestrator converts it into `tmp/claims/*.yaml` only after user approval.
8. Produce `execution_graph` that enforces this control flow:
   - `surface -> surface_review -> {test + implement} -> each_review -> integration_review -> ac_verification`
9. Surface planning must explicitly cover downstream prerequisites:
   - shared types/interfaces/exports
   - migration work
   - Sonamu sync-generated runtime prerequisites
   - Sonamu model scaffolding
   - any frame/module entry readiness required before test or implementation starts
10. When migration or scaffolding is needed, require Sonamu CLI usage and include both:
   - `required_skills`
   - `required_cli_commands`
11. Use these canonical Sonamu skill references when applicable:
   - `.claude/skills/sonamu/migration.md`
   - `.claude/skills/sonamu/scaffolding.md`
   - `.claude/skills/sonamu/api.md`
   - `.claude/skills/sonamu/entity-basic.md`
   - `.claude/skills/sonamu/auth.md`

## Output artifacts

### `plan_document`

```yaml
plan_document:
  status: "ready|needs_contract_update|needs_user_input"
  objective_summary: "..."
  contract_basis:
    - "contract/..."
  rules_basis:
    - "contract/rules/..."
  code_basis:
    - "src/..."
  ac_strategy:
    status: "existing|needs_generation|partial_update"
    notes:
      - "..."
  stage_plan:
    - stage: "surface"
      objective: "..."
      rationale: "..."
    - stage: "test"
      objective: "..."
      rationale: "..."
    - stage: "implement"
      objective: "..."
      rationale: "..."
  validation_matrix:
    - "pnpm build"
    - "pnpm check"
    - "pnpm sonamu test -s"
    - "pnpm sonamu test"
  blockers:
    - "..."
  review_strategy:
    - "surface unit review"
    - "test unit review"
    - "implement unit review"
    - "integration review"
```

### `claim_blueprint`

```yaml
claim_blueprint:
  - id: "C-SURFACE-001"
    type: "surface|test|implement"
    objective: "..."
    context: "..."
    scope:
      read:
        - "..."
      write:
        - "..."
    ac_targets:
      - "filepath::describe-group::test-name"
    rules:
      - "contract/rules/..."
    required_skills:
      - ".claude/skills/sonamu/migration.md"
    required_cli_commands:
      - "pnpm sonamu sync"
      - "pnpm sonamu scaffold model <EntityId>"
    expected_generated_targets:
      - "src/application/.../...model.ts"
    depends_on:
      - "C-SURFACE-000"
    parallel_group: "P-TEST-IMPLEMENT"
    review_scope: "unit|integration"
    done_criteria:
      - "..."
```

### `execution_graph`

```yaml
execution_graph:
  nodes:
    - "surface"
    - "surface_review"
    - "test"
    - "implement"
    - "test_review"
    - "implement_review"
    - "integration_review"
    - "ac_verification"
  edges:
    - from: "surface"
      to: "surface_review"
    - from: "surface_review"
      to: "test"
    - from: "surface_review"
      to: "implement"
    - from: "test"
      to: "test_review"
    - from: "implement"
      to: "implement_review"
    - from: "test_review"
      to: "integration_review"
    - from: "implement_review"
      to: "integration_review"
    - from: "integration_review"
      to: "ac_verification"
```

## Handoff contract

- Return `plan_document`, `claim_blueprint`, and `execution_graph` together.
- The orchestrator validates and executes these artifacts.
- The planner must not duplicate orchestration work by drafting `tmp/claims/*.yaml` directly.
