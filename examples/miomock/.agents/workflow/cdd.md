# Contract-Driven Development (CDD)

## Core principles

- Authority order: **Contract > Spec > Code**
- **1 Contract feature = 1 Spec file**
- Contract is user-owned. AI must not modify Contract without an explicit user request.
- Every Contract, Spec, or feature-change request must review related artifacts before completion.
- If implementation needs to change, update the Spec first, then change code.
- Contract/Spec content (summary, description, AC conditions, schema field values) must be written in Korean. Code, file paths, and identifiers remain in English.

## Automation model

CDD separates the work into four responsibilities:

| Responsibility | Role | Responsibility detail |
|---|---|---|
| Control plane | Orchestrator | Select the phase worker, manage user-review gates, run `cdd advance --commit`, manage loops |
| Execution + verification | Leaf worker | Perform phase work, resolve in-scope findings, and return commit-ready state; during `implementing`, the orchestrator fans in parallel worker outputs before re-running `cdd advance` |
| Judgment gate | CLI | Run Layer 1 checks and emit delegate payload for Layer 2 |
| Memory | Spec document | Persist state, specification, history, and code/test linkage across phases |

Operational rules:
- The orchestrator must not do Phase work directly in the main session.
- The only direct orchestrator mutation is Phase 1 scaffold creation with `cdd spec create`.
- Leaf workers own the step-by-step phase loop. For all phases except the parallel `implementing` pair, the phase owner also owns the pre-commit `cdd advance <spec>` check.
- During `implementing`, the orchestrator spawns the test and code workers in parallel, fans in their outputs, re-runs `cdd advance <spec>` on the integrated state, and re-routes findings to the owning worker until the transition is ready.
- If preset sub-agents are unavailable, use inline fallback instructions. Direct main-session execution is not a fallback mode.

## Project structure

```text
contract/
  schemas/
    *.schema.json
  main.contract.json
  {domain}/
    main.contract.json
    {feature-key}.spec.json
  shared/
    {shared}.spec.json
```

## Schema system

Schemas define the custom field structure for Contract and Spec documents. Location: `contract/schemas/`

```json
{
  "id": "default-spec",
  "type": "spec",
  "fields": [
    { "name": "modules", "type": "Record<string, string>", "description": "모듈 구조와 책임 정의", "required": true },
    { "name": "dataFlow", "type": "string[]", "description": "모듈 간 데이터 흐름 순서", "required": true }
  ]
}
```

Field meanings:
- `name`: field name
- `type`: storage shape such as `string`, `string[]`, `Record<string, string>`, `Record<string, object>`
- `description`: semantic authoring rule and Layer 2 verification rule
- `renderer`: optional UI rendering hint
- `required`: optional required flag

## Document model

### Contract (`.contract.json`)

Business logic and feature scope definition. Implementation details are excluded.

Core fields:
- `schema`
- `features`

Custom fields are defined by the referenced schema.

### Spec (`.spec.json`)

Implementation specification management. Connects Contract requirements to concrete code and tests.

Core fields used by the current transition gates:
- `schema`
- `schemaVersion`
- `summary`
- `description`
- `acceptanceCriteria`
- `status`
- `sources`
- `contracts`
- `lastModified`
- `dependsOnSpecs` (optional)

`schemaVersion` and `lastModified` are document metadata in addition to the transition-gated fields below. Keep them valid when touching Specs.

Custom fields are defined by the referenced schema.

### AcceptanceCriterion

```json
{
  "id": "ac-login-jwt",
  "condition": "유효한 이메일/비밀번호 로그인 시 JWT 토큰을 반환한다",
  "testRef": {
    "target": "src/auth/login.test.ts",
    "pattern": "returns.*JWT"
  }
}
```

- `condition` must be concrete and pass/fail verifiable.
- `testRef` may remain empty during specification work, but `cdd-test-writer` must fill it before the Spec can finish.

## Status workflow

```text
draft → specifying → implementing → validating → done
```

Only adjacent transitions are allowed. `cdd advance <spec>` enforces the gate for each transition.

| Transition | Layer 1 (CLI) | Layer 2 (worker semantic verification) |
|---|---|---|
| `draft -> specifying` | valid Contract reference, non-empty `summary`, `description`, ACs, required schema fields | schema field content matches field descriptions, ACs are verifiable, Spec stays within Contract scope |
| `specifying -> implementing` | non-empty `summary`, `description`, ACs, required schema fields | schema field quality, AC quality, cross-field consistency, feature-level completeness |
| `implementing -> validating` | `sources` files exist, AC `testRef.target` exists | code implements the Spec, tests validate AC meaning, Spec-code consistency |
| `validating -> done` | AC `testRef.pattern` is non-empty and matches the test file, build/test pass | AC-test semantic match, constraints reflected, error-handling coverage |

`--commit` means the orchestrator is finalizing a transition after the worker has already completed the pre-commit checks. When `objective_packet.user_review=true`, the orchestrator must wait for user confirmation before running `cdd advance <spec> --commit`.

## User review gate

Each phase spawn includes `objective_packet.user_review`.

Default values:
- `cdd-contract-writer`: `false`
- `cdd-specifier`: `true`
- `cdd-test-writer`: `false`
- `cdd-implementer`: `false`
- `cdd-validator`: `false`

When `user_review=true`:
- The worker still completes the full pre-commit phase loop.
- The orchestrator must pause before `cdd advance --commit`.
- After the review, the orchestrator either re-routes for more work or finalizes the transition.

## Worker ownership

- `cdd-specifier`: Spec content edits and pre-commit verification for `draft -> specifying` and `specifying -> implementing`
- `cdd-test-writer`: acceptance-test authoring plus `acceptanceCriteria[].testRef` ownership during `implementing`
- `cdd-implementer`: production-code implementation plus final `sources` ownership during `implementing`
- `cdd-validator`: validating-stage code/test fixes and final pre-commit verification for `validating -> done`

If a worker discovers that another worker owns the required change, it must report that to the orchestrator instead of editing across the boundary.

## Parallel implementing rules

When the Spec status is `implementing`:
- The orchestrator must spawn `cdd-test-writer` and `cdd-implementer` in parallel.
- `cdd-test-writer` may edit only acceptance tests, test support files, and `acceptanceCriteria[].testRef`.
- `cdd-implementer` may edit only production code, implementation support files, and `sources`.
- Neither worker may rewrite `summary`, `description`, AC `condition`, schema-defined fields, or Contract references.
- The orchestrator fans in both worker outputs, runs `cdd advance <spec>` without `--commit` on the integrated state, and re-spawns only the worker that owns the reported finding.
- If the integrated findings span both test ownership and code ownership, the orchestrator may re-spawn both workers in parallel again.

## Cross-artifact impact review

- Contract-change requests must inspect Spec files whose `contracts` array references the changed Contract path.
- `cdd-contract-writer` may report impacted Spec follow-up work, but must not edit Spec files directly.
- Feature-change requests must resolve the matching feature Spec first and decide whether the target Spec needs modification or additional content.
- Spec-change requests must inspect the target Spec's `contracts` and `dependsOnSpecs` before closing the phase.
- After assessing and updating the target Spec as needed for a feature-change request, run the same related Spec and Contract review before closing the request.
- `cdd-specifier` may update directly related Spec files when those updates are required to keep Specs consistent.
- If Spec work reveals Contract drift and the user did not explicitly request a Contract edit, stop and escalate instead of editing the Contract.

## Automation workflow

1. The main agent assumes the CDD orchestrator role.
2. If no Spec exists, the orchestrator runs `cdd spec create` to create the scaffold.
3. All subsequent Phase work is delegated to leaf workers.
4. For `implementing`, the orchestrator spawns `cdd-test-writer` and `cdd-implementer` in parallel, fans in both outputs, re-runs `cdd advance <spec>`, and re-spawns the owner of any remaining finding until the integrated state is ready.
5. For the other phases, the phase owner performs its phase work, runs `cdd advance <spec>`, resolves in-scope Layer 1 and Layer 2 findings, and returns only when the next transition is ready for orchestrator commit or the phase is blocked.
6. If a worker returns blocked, the orchestrator re-spawns the correct worker or asks the user when the boundary exceeds worker ownership.
7. If the active phase result is ready and `objective_packet.user_review=true`, the orchestrator asks the user to review before finalizing the transition.
8. The orchestrator finalizes the transition with `cdd advance <spec> --commit`.

## CLI

```bash
cdd advance <spec> [--commit]
cdd status [file]
cdd spec create <name>
```

Automation prompts live under `.agents/workflow/`.
