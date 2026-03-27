# Contract-Driven Development (CDD)

## Core principles

- Authority order: **Contract > Spec > Code**
- **1 Contract feature = 1 Spec file**
- Contract is user-owned. AI must not modify Contract without an explicit user request.
- Every Contract, Spec, feature-change, or implementation/test change must complete artifact reconciliation before completion.
- If implementation needs to change, update the Spec first, then change code.
- Contract/Spec content (summary, description, AC conditions, schema field values) must be written in Korean. Code, file paths, and identifiers remain in English.

## Automation model

CDD separates the work into five responsibilities:

| Responsibility | Role | Responsibility detail |
|---|---|---|
| Control plane | Orchestrator | Select the phase worker, manage user-review gates, choose the Layer 2 backend, run `cdd advance --commit`, and manage loops |
| Execution | Leaf worker | Perform phase work, resolve Layer 1 failures and owned findings, and return review-ready state; during `implementing`, the orchestrator fans in parallel worker outputs before re-running `cdd advance` |
| Judgment gate | CLI | Run Layer 1 checks and emit a Layer 2 review packet |
| Semantic review backend | Codex MCP or `cdd-layer2-reviewer` | Review the Layer 2 packet, return findings only, and never absorb edit ownership |
| Memory | Spec document | Persist state, specification, history, and code/test linkage across phases |

Operational rules:
- The orchestrator must not do Phase work directly in the main session.
- The only direct orchestrator mutation is Phase 1 scaffold creation with `cdd spec create`.
- The orchestrator and every leaf worker must read the default rules file before routing or phase work starts.
- Leaf workers own the step-by-step phase loop up to a clean Layer 1 result. Contract authoring has no `cdd advance` loop. For Spec phases that actually own a status transition, the phase owner also owns the pre-commit `cdd advance <spec>` check and all in-scope Layer 1 fixes. `cdd-specifier` skips `cdd advance` when it is spawned only for later-phase artifact reconciliation.
- When `cdd advance <spec>` emits a delegate payload, the phase owner must stop the self-loop and return that packet to the orchestrator. The orchestrator then runs Layer 2 through the default backend (`Codex MCP`) or, on failure/unavailability, the fallback backend (`cdd-layer2-reviewer`).
- During `implementing`, the orchestrator always spawns `cdd-implementer`, and it also spawns `cdd-test-writer` only when the Spec keeps `useTestRef=true`. The orchestrator fans in the active worker outputs, re-runs `cdd advance <spec>` on the integrated state, invokes the Layer 2 backend on the integrated review packet, and re-routes findings to the owning worker until the transition is ready.
- If preset sub-agents are unavailable, use inline fallback instructions. Direct main-session execution is not a fallback mode.

## Project structure

```text
contract/
  rules/
    *.rules.json
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
    { "name": "modules", "type": "Record<string, string>", "renderer": "label-grid", "required": true },
    { "name": "dataFlow", "type": "string[]", "renderer": "bullet-list", "required": true }
  ]
}
```

Field meanings:
- `name`: field name
- `type`: storage shape such as `string`, `string[]`, `Record<string, string>`, `Record<string, object>`
- `description`: optional semantic authoring rule and Layer 2 verification rule when present
- `renderer`: optional UI rendering hint
- `required`: optional required flag

## Rule files

Rule files capture reusable implementation conventions that the orchestrator and workers must internalize before phase work. They live under `contract/rules/`.

Recommended shape:

```json
{
  "description": "Rule-set purpose and scope",
  "rules": [
    {
      "id": "readonly-money-display-uses-numf",
      "when": "rendering read-only money values",
      "instruction": "Use numF() for formatting.",
      "examples": ["numF(row.totalAmount)"]
    }
  ]
}
```

Field meanings:
- `description`: explains the scope and intent of the rule set
- `rules[].id`: stable identifier for prompt references, diffs, and review notes
- `rules[].when`: short condition or trigger for the rule
- `rules[].instruction`: concrete directive the worker must follow
- `rules[].examples` (optional): representative code or usage examples

Operational rules:
- The orchestrator must inspect `contract/rules/`, resolve the applicable `*.rules.json` files for the current task, and read them before phase routing.
- Every spawned worker must receive those file paths as `rules_paths`, read each file before making changes, and apply the relevant rules to the owned scope.
- If a governed task cannot be matched to rule files, or if a referenced rule file is missing or malformed, stop and report the configuration gap instead of continuing blindly.

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
- `useTestRef` (optional, default `true`)
- `summary`
- `description`
- `acceptanceCriteria`
- `status`
- `sources`
- `contracts`
- `dependsOnSpecs` (optional)

Live metadata fields that must be preserved on Spec edits:
- `schemaVersion`
- `lastModified`

Current Specs in this workflow use `schemaVersion: 2`. Workers that edit Spec fields must preserve `schemaVersion` and refresh `lastModified`.

`useTestRef` controls whether AC-to-test mapping is required for the Spec.
- Omitted means `true`.
- Set `false` only for exceptional Specs, such as FE/web flows that intentionally close without acceptance-test ownership in this workflow.

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
- When `useTestRef=true`, `testRef` may remain empty during specification work, but `cdd-test-writer` must fill it before the Spec can finish.
- When `useTestRef=false`, `testRef` may remain empty through `done`.

## Status workflow

```text
draft → specifying → implementing → validating → done
```

Only adjacent transitions are allowed. `cdd advance <spec>` enforces the gate for each transition.

| Transition | Layer 1 (CLI) | Layer 2 (semantic review backend) |
|---|---|---|
| `draft -> specifying` | valid Contract reference, non-empty `summary`, `description`, ACs, required schema fields | schema field content matches field names/types and any field descriptions that exist, ACs are verifiable, Spec stays within Contract scope |
| `specifying -> implementing` | non-empty `summary`, `description`, ACs, required schema fields | schema field quality, AC quality, cross-field consistency, feature-level completeness, and consistency against every document referenced in the target Spec's `sources`, `dependsOnSpecs`, and `contracts`; required target/related Spec updates must be completed before the transition |
| `implementing -> validating` | `sources` files exist; when `useTestRef=true`, every AC `testRef.target` exists and the CLI validating gate runs Sonamu-first tests | code implements the Spec, tests validate AC meaning when `useTestRef=true`, Spec-code consistency, and every changed file is reconciled against all Specs whose `sources` include that file plus their `contracts` and `dependsOnSpecs`; required Spec follow-up must be completed or routed before the transition |
| `validating -> done` | when `useTestRef=true`, every AC `testRef.pattern` is non-empty, valid as a regex, and matches the test file | AC-test semantic match when `useTestRef=true`, constraints reflected, error-handling coverage, and final implementation evidence |

`--commit` means the orchestrator is finalizing a transition after the phase owner has already completed the pre-commit Layer 1 checks and the Layer 2 backend has returned a clean result. The CLI Layer 1 gate now runs the validating-stage Sonamu-first test command only when `useTestRef=true`; otherwise test execution remains worker-owned evidence for the current scope.

## Layer 2 backend policy

- Layer 2 is an orchestrator-managed semantic gate, not a phase-worker self-review loop.
- Default backend: `Codex MCP`
- Fallback backend: `cdd-layer2-reviewer`
- The Layer 2 backend must never edit code, Spec, or tests directly. It returns findings only.
- The orchestrator must route returned findings to the owning worker:
  - narrative/schema/Contract/scope issues -> `cdd-specifier`
  - shared surface or migration-prerequisite issues -> `cdd-surface-scaffolder`
  - test mapping or acceptance-test issues -> `cdd-test-writer`
  - production-code or `sources` issues -> `cdd-implementer`
  - validating-stage code/test fixes without `testRef` edits -> `cdd-validator`
- `Codex MCP` review must follow the inherited human-in-the-loop and progress tracking policy. If `Codex MCP` is unavailable, fails, or is disallowed for the current run, the orchestrator must spawn `cdd-layer2-reviewer` with the same review packet.

## User review gate

Each phase spawn includes `objective_packet.user_review`.

Default values:
- `cdd-contract-writer`: `true`
- `cdd-specifier`: `true`
- `cdd-surface-scaffolder`: `false`
- `cdd-test-writer`: `false`
- `cdd-implementer`: `false`
- `cdd-validator`: `false`

When `user_review=true`:
- The worker still completes its owned phase loop and returns review-ready output.
- The orchestrator must pause before phase closure. For Spec transitions, this means before `cdd advance --commit`.
- After the review, the orchestrator either re-routes for more work or finalizes the phase.

## Worker ownership

- `cdd-specifier`: Spec content edits, `useTestRef` decisions, `schemaVersion` normalization, target/related Spec reconciliation after feature or implementation/test discoveries, and pre-commit Layer 1 verification for `draft -> specifying` and `specifying -> implementing`
- `cdd-surface-scaffolder`: minimal shared type/interface/export/runtime scaffold work plus Spec-driven migration preparation required before parallel `implementing` work can start safely
- `cdd-test-writer`: acceptance-test authoring plus `acceptanceCriteria[].testRef` ownership during `implementing` when `useTestRef=true`
- `cdd-implementer`: production-code implementation plus final `sources` ownership during `implementing`, and the sole implementing worker when `useTestRef=false`
- `cdd-validator`: validating-stage code/test fixes and final pre-commit Layer 1 verification for `validating -> done`

If a worker discovers that another worker owns the required change, it must report that to the orchestrator instead of editing across the boundary.
Any worker that edits Spec fields it owns must preserve `schemaVersion` and refresh `lastModified`.

## Implementing preparation and parallel rules

When the Spec status is `implementing`:
- If the planned work requires new importable modules, shared types/interfaces, runtime exports, placeholder entrypoints, or migration prerequisites described in the Spec before downstream work can proceed, the orchestrator should first spawn `cdd-surface-scaffolder`.
- `cdd-surface-scaffolder` may edit only shared type/interface/export files, minimal runtime scaffolds, and migration prerequisites needed so planned imports resolve and prerequisite schema state exists. It must not add business logic, acceptance tests, or Spec changes.
- After the shared surface is ready, the orchestrator must always spawn `cdd-implementer`, and it must also spawn `cdd-test-writer` in parallel only when `useTestRef=true`.
- The shared surface worker and the parallel pair must receive the same `rules_paths` so they apply one consistent rule set.
- `cdd-test-writer` may edit only acceptance tests, test support files, and `acceptanceCriteria[].testRef`.
- `cdd-implementer` may edit only production code, implementation support files, and `sources`.
- Every active implementing worker must re-route missing shared surface or migration-prerequisite findings to `cdd-surface-scaffolder` instead of inventing or broadening their own scope.
- Neither worker may rewrite `summary`, `description`, AC `condition`, schema-defined fields, or Contract references.
- The orchestrator fans in the active worker outputs, handles any artifact-reconciliation follow-up they report, runs `cdd advance <spec>` without `--commit` on the integrated state, and re-spawns only the worker that owns the reported finding.
- If the integrated findings span shared surface or migration-prerequisite work plus test/code ownership, the orchestrator may re-run `cdd-surface-scaffolder`, the parallel pair, or both as needed.

## Artifact reconciliation

- Artifact reconciliation is mandatory after any feature-change request and after any code/test change that alters confirmed behavior, interface, constraints, validation rules, error handling, data shape, or file layout.
- Minimum scope for Spec-content work: every document path referenced in the target Spec's `sources`, plus every path listed in `dependsOnSpecs` and `contracts`.
- Minimum scope for code/test work: every Spec whose `sources` includes a changed file, plus each source-linked Spec's `sources`, `contracts`, and `dependsOnSpecs`.
- `cdd-test-writer`, `cdd-implementer`, and `cdd-validator` must inspect that scope and report whether the target Spec or any source-linked Spec needs updates before the request can close.
- `cdd-specifier` owns Spec updates required by artifact reconciliation even when the current Spec status is `implementing`, `validating`, or `done`. In that mode it preserves the current `status` and refreshes `lastModified`.
- If artifact reconciliation reveals Contract drift and the user did not explicitly request Contract edits, stop and escalate instead of mutating Contract files.

## Cross-artifact impact review

- Contract-change requests must inspect Spec files whose `contracts` array references the changed Contract path.
- `cdd-contract-writer` may report impacted Spec follow-up work, but must not edit Spec files directly.
- Feature-change requests must resolve the matching feature Spec first and decide whether the target Spec needs modification or additional content.
- Spec-change requests must inspect every document path referenced in the target Spec's `sources`, `contracts`, and `dependsOnSpecs` before closing the phase.
- Code/test-change work must inspect every Spec whose `sources` includes a changed file, then re-check those Specs' `sources`, `contracts`, and `dependsOnSpecs` before closure.
- After assessing and updating the target Spec as needed for a feature-change request, run the same `sources`, `dependsOnSpecs`, and Contract review before closing the request.
- If implementation or validation reveals target-Spec drift, route `cdd-specifier` before closing the request.
- If implementation or validation reveals related Spec consistency updates, keep those updates in `cdd-specifier` scope.
- `cdd-specifier` may update directly related Spec files when those updates are required to keep Specs consistent.
- If Spec work reveals Contract drift and the user did not explicitly request a Contract edit, stop and escalate instead of editing the Contract.

## Automation workflow

1. The main agent assumes the CDD orchestrator role.
2. The orchestrator resolves and reads the applicable rule files from `contract/rules/` before phase routing begins.
3. If no Contract exists, the orchestrator spawns `cdd-contract-writer`, gathers user review, and then re-checks artifact state.
4. If Contract exists but no Spec exists, the orchestrator runs `cdd spec create` to create the scaffold.
5. All subsequent Spec phase work is delegated to leaf workers, and every spawn includes the resolved `rules_paths`.
6. For `implementing`, the orchestrator first decides whether a shared surface scaffold or migration prerequisite is needed. If it is, the orchestrator runs `cdd-surface-scaffolder`, then always spawns `cdd-implementer` and additionally spawns `cdd-test-writer` only when `useTestRef=true`, inspects the active workers' artifact-reconciliation output, routes `cdd-specifier` or user escalation when later-phase Spec/Contract drift is reported, then re-runs `cdd advance <spec>`, sends the integrated Layer 2 packet to the active review backend, and re-spawns the owner of any remaining finding until the integrated state is ready.
7. For `draft`, `specifying`, and `validating`, the phase owner performs its phase work, runs `cdd advance <spec>` when that phase owns a transition, resolves in-scope Layer 1 findings, returns the Layer 2 packet to the orchestrator, and resumes only when the review backend reports findings that belong to that owner.
8. If a worker returns blocked, the orchestrator re-spawns the correct worker or asks the user when the boundary exceeds worker ownership.
9. If the active phase result is ready and `objective_packet.user_review=true`, the orchestrator asks the user to review before closing the phase.
10. For Spec transitions only, the orchestrator finalizes the transition with `cdd advance <spec> --commit`.

## CLI

```bash
cdd advance <spec> [--commit]
cdd status [file]
cdd spec create <name>
cdd contract create [name]
```

Automation prompts live under `.agents/workflow/`.
