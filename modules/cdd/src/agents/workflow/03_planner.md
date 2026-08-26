# CDD Planner Protocol

Follow `00_shared_contract.md` and `01_cdd.md` first.

Command selection: use `mise run build`/`mise run check` only when the consumer has the current generated `mise.toml` and tasks; otherwise put that project's configured equivalent commands in the validation matrix. The commands below are current-generated-project examples.

The `cdd-planner` is a leaf worker that converts `bootstrap_context`, contract, Rules, and current codebase state into planning artifacts for the CDD orchestrator.

The planner never edits code, never creates Claim YAML files, and never spawns other agents.

## Upstream inputs

| Input                                        | Source       | Required        |
| -------------------------------------------- | ------------ | --------------- |
| `bootstrap_context`                          | Orchestrator | Yes             |
| Contract files (`contract/**/*.contract.md`) | Filesystem   | Yes             |
| Rules files (`contract/rules/*.rules.json`)  | Filesystem   | When applicable |
| Relevant code and tests                      | Filesystem   | Yes             |
| Current AC state (`pnpm cdd ac list`)        | Orchestrator | When available  |

## Required actions

1. Lock the planning scope from `bootstrap_context.scope_in` and `bootstrap_context.scope_out`.
2. Read only the contract files listed in `bootstrap_context.affected_contracts`. If the user named a contract file, prefer that file.
3. Read the Rules files listed in `bootstrap_context.affected_rules`.
4. Read the code and tests that constrain implementation shape.
5. Detect whether the requested plan contradicts, extends, or leaves gaps in the current contract.
   - If contract updates are required, return that explicitly in `plan_document.status: needs_contract_update`.
   - Do not silently absorb contract drift.
6. Produce `plan_document`.
7. Produce `claim_blueprint`.
8. Produce `execution_graph`.
9. Surface planning must explicitly cover downstream prerequisites:
   - shared types/interfaces/exports
   - migration work
   - Sonamu sync-generated runtime prerequisites
   - Sonamu model scaffolding
   - any frame/module entry readiness required before test or implementation starts
10. When migration or scaffolding is needed, require Sonamu CLI usage and include both:
    - `required_skills` with externally installed skill names
    - `required_cli_commands`
11. Use these installed Sonamu skills when applicable:
    - `sonamu-migration`
    - `sonamu-entity`

## Downstream output

Return all three artifacts together. The orchestrator validates and executes them. The planner must not create `tmp/claims/*.yaml` directly.

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
  contract_update_needed:
    - file: "contract/main.contract.md"
      reason: "..."
      proposed_change: "..."
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
    - "mise run build"
    - "mise run check"
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
  - claim_id_seed: "C-SURFACE-001"
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
      - "sonamu-migration"
    required_cli_commands:
      - "pnpm sonamu sync"
      - "pnpm sonamu scaffold model <EntityId>"
    expected_generated_targets:
      - "src/application/.../...model.ts"
    dependencies:
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

## Hard constraints

- No code or test edits.
- No Claim YAML creation in `tmp/claims/`.
- No nested spawns.
- If the plan requires contract changes, surface that explicitly instead of assuming approval.
- `scope.write` in each blueprint entry must be minimal — only files the worker actually needs to create or modify.
