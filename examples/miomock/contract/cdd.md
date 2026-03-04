# Contract-Driven Development (CDD)

This project follows Contract-Driven Development (CDD). All development work must follow the rules below.

## Core Principles

- The `.contract.json` files under the `contract/` directory are the Single Source of Truth (SSoT) for this project.
- All development follows a **Waterfall process**. Move to the next stage only after the current stage is completed.
- Authority flows in this order: **Contract -> Spec -> Code**.
  - Code must always follow Spec.
  - Spec must always follow Contract.
- Even if a better structure appears during implementation, do not change code first. Update Spec first, then update code.
- Contract is human-managed. AI must not modify Contract files arbitrarily.

## Project Structure

```text
project/
|- contract/
|  |- main.contract.json          # project root contract
|  |- {domain}/
|  |  |- main.contract.json       # domain representative contract
|  |  |- {sub-contract}.contract.json
|  |  |- {feature}.spec.json      # same folder as related Contract
|  \- ...
|- src/
|  \- ...
\- ...
```

Example:

```text
project/
|- contract/
|  |- main.contract.json
|  |- auth/
|  |  |- main.contract.json
|  |  |- login.contract.json
|  |  |- token.contract.json
|  |  |- login.spec.json
|  |  \- session.spec.json
|  \- payment/
|     |- main.contract.json
|     |- checkout.contract.json
|     \- checkout.spec.json
|- src/
|  |- auth/login.ts
|  |- auth/login.test.ts
|  \- payment/checkout.ts
\- ...
```

- Contract: `*.contract.json` - folder-based tree structure, with `main.contract.json` as the folder representative.
- Spec: `*.spec.json` - flat per-folder structure (no extra layering), placed in the same folder as related Contract files.

## Document Model

### Contract (`.contract.json`)

A business-logic document that non-developers can read. AI must treat this file as **read-only**. If an update is needed, AI should only propose the change to the user.

```json
{
  "lastModified": "YYYY-MM-DD",
  "content": "Markdown body"
}
```

`content` fixed sections:

`Overview -> Domain Glossary -> Features/Capabilities -> User Roles/Actors -> Business Rules/Constraints -> Edge Cases`

### Spec (`.spec.json`)

A feature-level technical document derived from Contract. AI can create and update Spec files. Deletion is user decision only.

```json
{
  "lastModified": "YYYY-MM-DD",
  "status": "draft | in-progress | done",
  "sources": ["src/auth/login.ts"],
  "contracts": ["./auth.contract.json"],
  "content": "Markdown body"
}
```

`content` fixed sections:

`Summary -> Modules/Components -> Interfaces -> Data Flow -> Error Handling -> Technical Constraints`

**Spec is higher authority than code.** Code must always follow the confirmed Spec. If Spec and code conflict, code is wrong.

### `status` field

| Value | Meaning | Transition condition |
|---|---|---|
| `draft` | Spec is being written, not confirmed yet | Initial state |
| `in-progress` | Spec confirmed, implementation in progress | After all Spec sections are confirmed |
| `done` | Implementation complete and consistency validation passed | After code passes consistency check against Spec |

### Spec detail level

- Include: module structure, file/class responsibilities, function/API names with short descriptions, inter-module data flow.
- Exclude: internal implementation logic, algorithm details, variable names, code snippets.

### Reference rules

- `contracts` field: relative path from the Spec file (e.g. `"./payment.contract.json"`).
- `sources` field: relative path from the project root (e.g. `"src/auth/login.ts"`).

---

## Development Process

All processes follow Waterfall. Each stage starts only after the previous stage is complete. If you need to change a previous stage artifact, go back, update the document first, then re-run downstream stages.

### 1. New feature development

```text
Contract review -> Spec authoring/fix -> Code implementation -> Test authoring/execution -> Consistency validation
```

**Step 1: Contract review**
- Read related `.contract.json` files and identify business requirements for the target feature.
- Confirm the feature is defined under Contract `Features/Capabilities`.
- If not defined, propose a Contract update to the user. Continue only after Contract is updated.

**Step 2: Spec authoring/fix**
- Create `{feature}.spec.json` in the same folder as related Contract files.
- Set `status` to `"draft"`.
- Fill `contracts` with relative paths to base Contract files.
- Fill all fixed sections in `content` based on the target Contract feature.
- In `Summary`, explicitly state which Contract feature this Spec implements.
- Add planned implementation file paths to `sources`.
- **All fixed sections in `content` must be confirmed in this step.** After confirmation, set `status` to `"in-progress"` and continue.

**Step 3: Code implementation**
- Implement exactly following the confirmed module structure and interfaces defined in Spec.
- If a better structure appears during implementation, do not change code first. Go back to Step 2, update Spec first, then implement against the updated Spec.
- If new files are added or plans change, update `sources` in Spec first.

**Step 4: Test authoring and execution**
- Write tests for implemented code.
- Add test file paths to `sources`.
- Run tests and confirm they pass.

**Step 5: Consistency validation**
- Validate that implemented code follows the confirmed Spec exactly.
- Check whether `Modules/Components`, `Interfaces`, and `Data Flow` match Spec.
- **If mismatch exists, fix code.** Spec should not be changed to match code.
- After all validations pass, set `status` to `"done"` and update `lastModified` to today.

### 2. Existing code changes

```text
Impact analysis -> Contract/Spec review -> Spec update/fix -> Code update -> Test execution -> Consistency validation
```

**Step 1: Impact analysis**
- Find all Spec files whose `sources` include the target files.
- Check `contracts` in those Specs to identify chained impact scope.

**Step 2: Contract/Spec review**
- Read related Specs to understand current module structure and interfaces.
- Read Contract as well to ensure the change does not violate business rules.
- If the change conflicts with Contract business rules, notify the user and continue only after Contract update.

**Step 3: Spec update/fix**
- Determine whether the change affects Spec scope.
  - Interface changes, module add/remove, data flow changes -> Spec update is required.
  - Internal-only changes (refactoring, performance tuning) -> Spec update may be unnecessary, but verify `Modules/Components` is still accurate.
- If Spec update is required, update and confirm Spec first.
- If files are added/removed, update `sources`.
- Set `status` to `"in-progress"`.
- **Continue only after Spec is confirmed.**

**Step 4: Code update**
- Update code within confirmed Spec scope.
- If a better structure appears, do not change code first. Go back to Step 3 and update Spec first.

**Step 5: Test execution**
- Confirm existing tests pass.
- Add/update tests according to the change.

**Step 6: Consistency validation**
- Validate that updated code follows confirmed Spec exactly.
- **If mismatch exists, fix code.**
- After all validations pass, set `status` to `"done"` and update `lastModified` to today.

### 3. Bug fixes

```text
Bug analysis -> Related Spec/Contract review -> Spec update/fix (if needed) -> Code fix -> Tests -> Consistency validation
```

**Step 1: Bug analysis**
- Identify root cause and related source files.

**Step 2: Related Spec/Contract review**
- Find Spec files whose `sources` include affected files.
- Classify root cause:
  - Business rule violation -> verify Spec and code against Contract.
  - Implementation bug -> check Spec `Error Handling` and Contract `Edge Cases`.
  - Spec defect -> Spec failed to represent Contract correctly.

**Step 3: Spec update/fix (if needed)**
- If the bug is a missing technical case in Spec `Error Handling` or `Technical Constraints`, update those sections first.
- If the bug is a missing business case in Contract `Edge Cases`, propose Contract update to user. After Contract update, update Spec.
- Set `status` to `"in-progress"`.
- **Continue only after Spec is confirmed.**

**Step 4: Code fix**
- Fix code according to confirmed Spec.

**Step 5: Tests**
- Add a reproducing test case for the bug.
- Confirm tests pass after the fix.
- Confirm existing tests are not broken.

**Step 6: Consistency validation**
- Validate that fixed code follows confirmed Spec exactly.
- **If mismatch exists, fix code.**
- After all validations pass, set `status` to `"done"` and update `lastModified` to today.

---

## Contract/Spec Authoring Guide

### Contract authoring principles

- Use language that non-developers can understand.
- Do not include code, technical jargon, or implementation details.
- Define project-specific terms in `Domain Glossary`.
- Each item in `Features/Capabilities` must include clear business rules.
- `Business Rules/Constraints` should contain only global rules that cross individual features.
- `Edge Cases` should define business-level boundary conditions and decisions.

### Spec authoring principles

- Include all fixed sections in `content`. If empty, write `"N/A"`.
- In `Summary`, explicitly state which Contract feature is implemented.
- In `Interfaces`, include only function/API names and short descriptions (no signatures or implementation logic).
- `sources` must list all related implementation and test files.
- `contracts` must list relative paths to base Contract files.

### Reference path rules

- `contracts` field: relative path from the Spec file (e.g. `"./payment.contract.json"`).
- `sources` field: relative path from project root (e.g. `"src/auth/login.ts"`).

### `lastModified` update rule

- Whenever document content (`content`) or metadata changes, update `lastModified` to today's date.

---

## Prohibitions

- AI must not modify Contract files arbitrarily. If updates are needed, propose to user.
- AI must not delete Spec files arbitrarily. Deletion is user decision only.
- Do not write code without checking Contract and Spec first.
- Do not omit or reorder fixed sections in Spec.
- Do not include implementation internals, algorithm details, or code snippets in Spec.
- **Do not start implementation before Spec is confirmed.**
- **If Spec and code conflict, do not change Spec to match code. Always fix code to match Spec.**
- **If a better approach appears during implementation, do not change code first. Update Spec first.**
