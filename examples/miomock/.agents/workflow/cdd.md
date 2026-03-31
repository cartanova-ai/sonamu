# Contract-Driven Development (CDD)

## Core principles

- Code is the source of truth. Documents record domain rules in cohesive form and their decision rationale.
- AC (Acceptance Criteria) = test names. The describe/test in test files ARE the AC.
- Implementation plans (Claims) are disposable. They exist as work instructions for sub-agents and are discarded after completion.
- The planner builds planning artifacts. The orchestrator validates the approved plan, decomposes it into Claims, and manages execution.
- The orchestrator never edits code directly. All implementation is delegated to sub-agents.

## Permanent documents

| Document | Location | Content | Updated when |
|---|---|---|---|
| Business logic | `contract/**/*.contract.md` | Domain rules in cohesive form + decision rationale (see definition below) | Policy changes |
| Rules | `contract/rules/*.rules.json` | Code conventions, UI/API rules (split by FE/BE) | Convention changes |
| AC | describe/test in `*.test.ts` | Per-feature acceptance criteria. Pass/fail basis | Feature add/change |

## Disposable planning artifacts

| Artifact | Content | Created by | Consumed by |
|---|---|---|---|
| `plan_document` | Stage-aware plan grounded in contract + Rules + code | Planner | Orchestrator + user |
| `claim_blueprint` | Machine-readable Claim precursor with scope/dependency metadata | Planner | Orchestrator |
| `execution_graph` | Ordered execution and review flow | Planner | Orchestrator |

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

## Disposable execution document: Claim

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
| `required_skills` | Canonical skill files the worker must follow when the Claim needs them |
| `required_cli_commands` | Required CLI commands for migration/scaffolding/sync work |
| `expected_generated_targets` | Files or modules the worker must leave ready for downstream stages |
| `depends_on` | Predecessor Claim IDs. Determines parallel/sequential execution |
| `findings` | Retry context from review failures |

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

## Implementation process

1. **Planning**: The planner creates `plan_document`, `claim_blueprint`, and `execution_graph` from business logic + actual code + user request. If the plan contradicts the contract, propose contract updates to the user first.
2. **AC concretization**: Discuss with user, generate test skeletons via `pnpm cdd ac add`. Some features may intentionally have no AC (e.g. DB migrations, UI-only work).
3. **Plan finalization**: After user confirmation, the orchestrator converts the approved `claim_blueprint` into Claims (`surface / test / implement`).
4. **Execution**: Run surface Claims first so migration, sync, scaffolding, and shared prerequisites are ready before downstream work starts.
5. **Stage review**: Review surface Claims first. After surface review passes, run test + implement Claims in parallel and review each stage independently.
6. **Integration review**: After stage reviews pass, review the combined changed set for cross-cutting issues.
7. **AC verification**: Run tests -> on failure, pass failure log to the owning worker -> fix -> repeat from the relevant review stage. Claims with no `ac_targets` skip this step.

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
