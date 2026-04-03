# CDD Workflow Protocol

> For concept definitions (CDD principles, AC, contract.md, Rules format): read `.claude/skills/sonamu/cdd.md` first.

## Disposable planning artifacts

| Artifact | Content | Created by | Consumed by |
|---|---|---|---|
| `plan_document` | Stage-aware plan grounded in contract + Rules + code | Planner | Orchestrator + user |
| `claim_blueprint` | Machine-readable Claim precursor with scope/dependency metadata | Planner | Orchestrator |
| `execution_graph` | Ordered execution and review flow | Planner | Orchestrator |

## Claim

Work instructions delivered to sub-agents. Created as YAML in `tmp/claims/` and discarded after implementation.

```yaml
id: "C-001"
type: "surface|test|implement"
objective: "One-line goal"
context: |
  Background beyond the objective.
  Excerpted from business logic docs or generated during planning.
scope:
  read: ["file paths to reference"]
  write: ["file paths to create/modify"]
ac_targets:
  - "filepath::describe-group::test-name"
rules:
  - "contract/rules/api.rules.json"
required_skills:
  - ".claude/skills/sonamu/migration.md"
required_cli_commands:
  - "pnpm sonamu sync"
  - "pnpm sonamu scaffold model User"
expected_generated_targets:
  - "src/application/user/user.model.ts"
depends_on: []
findings: []
```

| Field | Role |
|---|---|
| `id` | Identifier for orchestrator tracking |
| `type` | Determines which sub-agent to spawn |
| `objective` | Scope anchor. The boundary the sub-agent must not exceed |
| `context` | Background info. Excerpted from business logic or generated during planning |
| `scope.read` | Context loading boundary |
| `scope.write` | Ownership boundary. Editing outside this is prohibited |
| `ac_targets` | ACs to satisfy. For implement: "must pass to complete". For test: "write tests for these" |
| `rules` | Paths to applicable rule files |
| `required_skills` | Canonical skill files the worker must read before starting |
| `required_cli_commands` | Required CLI commands for migration/scaffolding/sync work |
| `expected_generated_targets` | Files or modules the worker must leave ready for downstream stages |
| `depends_on` | Predecessor Claim IDs. Determines parallel/sequential execution |
| `findings` | Retry context from review failures |

## Contract maintenance

- When planner output reveals that the business logic has changed, update the contract document before proceeding with implementation.
- Contract updates require user confirmation.
- The orchestrator must not silently skip contract updates when the scope of work contradicts the current contract.

## Surface responsibilities

Surface work owns all downstream prerequisites that must exist before test or implementation starts:

- shared types/interfaces/exports
- migration preparation
- Sonamu sync-generated runtime prerequisites
- Sonamu model scaffolding
- frame or module entry readiness required by the approved plan

Migration and scaffolding must use Sonamu CLI. Do not hand-write migration files or bypass CLI-supported scaffolding paths.

## Execution flow

```
surface → surface_review → test + implement (parallel) → each stage_review → integration_review → ac_verification
```

1. **Planning**: Planner creates `plan_document`, `claim_blueprint`, `execution_graph` from contract + code + user request. If the plan contradicts the contract, propose contract updates first.
2. **AC concretization**: Discuss with user. Generate test skeletons via `pnpm cdd ac add`. Some features may intentionally have no AC (e.g. DB migrations, UI-only work).
3. **Plan finalization**: Orchestrator converts approved `claim_blueprint` into Claim YAML files under `tmp/claims/`.
4. **Execution**: Run surface Claims first. After surface review passes, run test + implement Claims in parallel.
5. **Stage review**: Review surface first. After surface passes, review test and implement stages independently (context-isolated).
6. **Integration review**: After stage reviews pass, review the combined changed set for cross-cutting issues.
7. **AC verification**: Run tests → on failure, pass log to the owning worker → fix → repeat from relevant stage review. Claims with no `ac_targets` skip this step.

## CLI

```bash
pnpm cdd ac add <file> [--describe <group>] <test-name>
pnpm cdd ac list [file]
pnpm sonamu sync
pnpm sonamu migrate generate
pnpm sonamu migrate run
pnpm sonamu scaffold model <EntityId>
pnpm sonamu scaffold model_test <EntityId>
```
