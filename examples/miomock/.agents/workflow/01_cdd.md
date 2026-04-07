# Contract-Driven Development (CDD)

Follow `00_shared_contract.md` first.

## Core principles

- Code is the source of truth. Contract documents record domain rules in cohesive form and their decision rationale.
- AC (Acceptance Criteria) = test names. The describe/test in test files ARE the AC.
- Implementation plans (Claims) are disposable. They exist as work instructions for sub-agents and are discarded after completion.
- The planner builds planning artifacts. The orchestrator validates the approved plan, decomposes it into Claims, and manages execution.
- The orchestrator never edits code directly. All implementation is delegated to sub-agents.

## Permanent documents

| Document       | Location                      | Content                                            | Updated when       |
| -------------- | ----------------------------- | -------------------------------------------------- | ------------------ |
| Business logic | `contract/**/*.contract.md`   | Domain rules in cohesive form + decision rationale | Policy changes     |
| Rules          | `contract/rules/*.rules.json` | Code conventions, UI/API rules (split by FE/BE)    | Convention changes |
| AC             | describe/test in `*.test.ts`  | Per-feature acceptance criteria. Pass/fail basis   | Feature add/change |

## What is business logic

Business logic exists entirely in code. But in code it is scattered across files and mixed with implementation details, making it hard to read domain rules in isolation. The contract document serves to:

> Describe business logic in cohesive, domain-level form and record the decision rationale that code alone does not convey.

What belongs in a contract:

- Domain rules and constraints ("Refunds are only allowed within 7 days of payment")
- Decision rationale ("PG provider policy requires this")
- Domain workflows that span multiple modules ("Order status: pending -> confirmed -> shipped -> completed")
- Priority/ordering rules ("Discount: membership tier > coupon > promotion")
- Domain glossary and role definitions
- Edge cases and their intended handling

What does NOT belong:

- Implementation details (file paths, function names, class structure)
- API endpoints or data schemas
- UI layout or component structure
- Code conventions (these go in Rules)

## Disposable planning artifacts

| Artifact            | Content                                                         | Created by   | Consumed by         | Schema                          |
| ------------------- | --------------------------------------------------------------- | ------------ | ------------------- | ------------------------------- |
| `bootstrap_context` | Refined scope, constraints, non-goals from user request         | Orchestrator | Planner             | `02_orchestrator.md#bootstrap`  |
| `plan_document`     | Stage-aware plan grounded in contract + Rules + code            | Planner      | Orchestrator + user | `03_planner.md#plan-document`   |
| `claim_blueprint`   | Machine-readable Claim precursor with scope/dependency metadata | Planner      | Orchestrator        | `03_planner.md#claim-blueprint` |
| `execution_graph`   | Ordered execution and review flow                               | Planner      | Orchestrator        | `03_planner.md#execution-graph` |

## Claim format

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
  - "modules/sonamu/src/skills/sonamu/migration.md"
required_cli_commands:
  - "pnpm sonamu sync"
  - "pnpm sonamu scaffold model User"
expected_generated_targets:
  - "src/application/user/user.model.ts"
depends_on: []
findings: []
```

| Field                        | Role                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| `id`                         | Identifier for orchestrator tracking                                                      |
| `type`                       | Determines which sub-agent to spawn                                                       |
| `objective`                  | Scope anchor. The boundary the sub-agent must not exceed                                  |
| `context`                    | Background info. Excerpted from business logic or generated during planning               |
| `scope.read`                 | Context loading boundary                                                                  |
| `scope.write`                | Ownership boundary. Editing outside this is prohibited                                    |
| `ac_targets`                 | ACs to satisfy. For implement: "must pass to complete". For test: "write tests for these" |
| `rules`                      | Paths to applicable rule files                                                            |
| `required_skills`            | Canonical skill files the worker must follow when the Claim needs them                    |
| `required_cli_commands`      | Required CLI commands for migration/scaffolding/sync work                                 |
| `expected_generated_targets` | Files or modules the worker must leave ready for downstream stages                        |
| `depends_on`                 | Predecessor Claim IDs. Determines parallel/sequential execution                           |
| `findings`                   | Retry context from review failures                                                        |

## Contract maintenance

- When planner output reveals that the business logic has changed (new rules, modified constraints, removed features), update the contract document before proceeding with implementation.
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

If the approved plan requires a Frame class or adjacent runtime shell that has no dedicated scaffold command, surface still owns making that downstream-ready after running the required Sonamu CLI sync/scaffold steps for surrounding prerequisites.

## Implementation process (high-level)

1. **Bootstrap**: Orchestrator refines user request into `bootstrap_context`.
2. **Planning**: Planner creates `plan_document`, `claim_blueprint`, and `execution_graph`.
3. **AC concretization**: Discuss with user, generate test skeletons via `pnpm cdd ac add`.
4. **Plan finalization**: After user confirmation, orchestrator converts `claim_blueprint` into Claims.
5. **Execution**: Surface Claims first, then test + implement in parallel.
6. **Stage review**: Surface review first, then test + implement reviews independently.
7. **Integration review**: Cross-cutting review across all changed files.
8. **AC verification**: Run tests, fix failures, repeat from relevant review stage.
9. **Handoff**: Package results for user delivery.

## Rules file format

```json
{
  "description": "Purpose and scope of this rule set",
  "rules": [
    {
      "id": "rule-id",
      "when": "Trigger condition",
      "instruction": "Concrete directive",
      "examples": ["Example (optional)"]
    }
  ]
}
```

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
