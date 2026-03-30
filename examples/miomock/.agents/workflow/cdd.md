# Contract-Driven Development (CDD)

## Core principles

- Code is the source of truth. Documents record domain rules in cohesive form and their decision rationale.
- AC (Acceptance Criteria) = test names. The describe/test in test files ARE the AC.
- Implementation plans (Claims) are disposable. They exist as work instructions for sub-agents and are discarded after completion.
- The orchestrator never edits code directly. All implementation is delegated to sub-agents.

## Permanent documents

| Document | Location | Content | Updated when |
|---|---|---|---|
| Business logic | `contract/**/*.contract.md` | Domain rules in cohesive form + decision rationale (see definition below) | Policy changes |
| Rules | `contract/rules/*.rules.json` | Code conventions, UI/API rules (split by FE/BE) | Convention changes |
| AC | describe/test in `*.test.ts` | Per-feature acceptance criteria. Pass/fail basis | Feature add/change |

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

## Disposable documents: Claim

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
| `depends_on` | Predecessor Claim IDs. Determines parallel/sequential execution |
| `findings` | Retry context from review failures |

## Contract maintenance

- When planning reveals that the business logic has changed (new rules, modified constraints, removed features), update the contract document before proceeding with implementation.
- Contract updates require user confirmation.
- The orchestrator must not silently skip contract updates when the scope of work contradicts the current contract.

## Implementation process

1. **Planning**: Draft implementation plan referencing business logic + actual code + user request. If the plan contradicts the contract, propose contract updates to the user first.
2. **AC concretization**: Discuss with user, generate test skeletons via `pnpm cdd ac add`. Some Claims may intentionally have no AC (e.g. DB migrations, UI-only work).
3. **Plan finalization**: After user confirmation, compose Claims (surface / test / implement).
4. **Execution**: Sub-agents run surface work -> then test writing + code implementation (parallel).
5. **Review**: Code review via reviewer agent.
6. **AC verification**: Run tests -> on failure, pass failure log to implementer -> fix -> repeat from step 5. Claims with no `ac_targets` skip this step.

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
```
