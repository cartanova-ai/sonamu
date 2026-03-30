# Contract-Driven Development (CDD)

## Core principles

- Code is the source of truth. Documents only record what is not visible in the code.
- AC (Acceptance Criteria) = test names. The describe/test in test files ARE the AC.
- Implementation plans (Unit packets) are disposable. They exist as work instructions for sub-agents and are discarded after completion.
- The orchestrator never edits code directly. All implementation is delegated to sub-agents.

## Permanent documents

| Document | Location | Content | Updated when |
|---|---|---|---|
| Business logic | `contract/{domain}/logic.md` | Domain rules in cohesive form + decision rationale that code alone does not convey | Policy changes |
| Rules | `contract/rules/*.rules.json` | Code conventions, UI/API rules (split by FE/BE) | Convention changes |
| AC | describe/test in `*.test.ts` | Per-feature acceptance criteria. Pass/fail basis | Feature add/change |

## Disposable documents: Unit Packet

Work instructions delivered to sub-agents. Created as YAML in `tmp/units/` and discarded after implementation.

```yaml
id: "U-001"
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
| `depends_on` | Predecessor Unit IDs. Determines parallel/sequential execution |
| `findings` | Retry context from review failures |

## Implementation process

1. **Planning**: Draft implementation plan referencing business logic + actual code + user request.
2. **AC concretization**: Discuss with user, generate test skeletons via `pnpm sonamu ac add`.
3. **Plan finalization**: After user confirmation, compose Unit packets (surface / test / implement).
4. **Execution**: Sub-agents run surface work -> then test writing + code implementation (parallel).
5. **Review**: Code review via reviewer agent.
6. **AC verification**: Run tests -> on failure, pass failure log to implementer -> fix -> repeat from step 5.

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
pnpm sonamu ac add <file> [--describe <group>] <test-name>
pnpm sonamu ac list [file]
```
