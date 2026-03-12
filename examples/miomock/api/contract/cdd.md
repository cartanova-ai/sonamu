# Contract-Driven Development (CDD)

This project follows Contract-Driven Development (CDD). All development work must follow the rules below.

## Core Principles

- The `.contract.json` files under the `contract/` directory are the Single Source of Truth (SSoT) for this project.
- All development follows a **Waterfall process**. Move to the next stage only after the current stage is completed.
- Authority flows in this order: **Contract -> Spec -> Code**.
  - Code must always follow Spec.
  - Spec must always follow Contract.
- **1 Contract Feature = 1 Spec File**. Contract's `features` field key maps to Spec filename 1:1. Shared infrastructure across features may be separated into `shared/*.spec.json`.
- Even if a better structure appears during implementation, do not change code first. Update Spec first, then update code.
- Contract is human-managed. AI must not modify Contract files without user request. When the user explicitly asks to update Contract, AI may edit directly. Otherwise, AI should only propose changes.
- Code-document consistency is verified by AI automated validation (1st pass) and review checklist (2nd pass for feature mapping/coverage).

## Project Structure

```text
project/
|- contract/
|  |- schemas/
|  |  |- default-contract.schema.json  # Contract field schema
|  |  \- default-spec.schema.json      # Spec field schema
|  |- main.contract.json                # project root contract
|  |- {domain}/
|  |  |- main.contract.json            # domain representative contract
|  |  |- {sub-contract}.contract.json
|  |  \- {feature-key}.spec.json       # 1 feature = 1 spec file
|  \- shared/
|     \- {shared-infra}.spec.json      # cross-feature shared infrastructure
|- src/
|  \- ...
\- ...
```

- Format: `contract/schemas/*.schema.json` — defines custom field schemas for Contract and Spec.
- Contract: `*.contract.json` — folder-based tree structure, with `main.contract.json` as the folder representative.
- Spec: `*.spec.json` — one file per feature, placed in the same folder as related Contract files.

## Schema System

Schema documents define the custom field structure for Contract and Spec files. Each Contract/Spec references a schema by ID.

### Schema document (`.schema.json`)

Location: `contract/schemas/`

```json
{
  "id": "default-spec",
  "type": "spec",
  "fields": [
    { "name": "modules", "type": "Record<string, string>", "required": true },
    { "name": "interfaces", "type": "Record<string, string>", "required": true },
    { "name": "dataFlow", "type": "string[]", "required": true },
    { "name": "errorHandling", "type": "Record<string, string>", "required": true },
    { "name": "constraints", "type": "string[]", "required": true }
  ]
}
```

- `id` (string, required): Format identifier, referenced by Contract/Spec `schema` field
- `type` (`"contract"` | `"spec"`, required): Target document type
- `fields` (array, required): Custom field definitions

Each field item:

- `name` (string): Field name
- `type` (string): Field type (see Type System below)
- `required` (boolean): Whether the field is required

Schema fields define only the **custom** portion of the document. Fixed fields are always present regardless of format.

### Type System

Schema types serve as **UI component rendering hints**. Validation only minimally checks that the value structure matches the type.

- `string`: Text block. Prose text (summary, etc.). Validation: value is a string.
- `string[]`: Ordered list. Ordered item listing (dataFlow, overview, etc.). Validation: value is a string array.
- `Record<string, string>`: Key-value table. Key-value dictionary (modules, errorHandling, etc.). Validation: value is an object.
- `Record<string, object>`: Key + structured card/panel. Dictionary with complex object values (API definitions, type definitions, etc.). Validation: value is an object. Internal structure is free-form.

### Schema Independence

Each Schema is fully independent. There is no inheritance or extension mechanism. If a domain needs a different structure, create a separate Schema.

## Document Model

### Contract (`.contract.json`)

A business-logic document that non-developers can read. AI must treat this file as **read-only**. If an update is needed, AI should only propose the change to the user.

**Fixed fields** (always present, not defined by schema):

- `schema` (string, required): Schema ID
- `lastModified` (string YYYY-MM-DD, required): Last modified date
- `features` (Record<string, string>, required): Feature list (key: feature key matching Spec filename, value: feature description)

**Custom fields**: defined by the Schema document referenced in `schema`.

Example (with `default-contract` schema):

```json
{
  "schema": "default-contract",
  "lastModified": "2026-03-09",
  "features": {
    "login": "Email/password-based user authentication",
    "session": "Session issuance and renewal",
    "password-reset": "Password reset via email verification"
  },
  "overview": [
    "Authentication domain: user login and session management.",
    "Includes email/password auth, session token management, and password reset."
  ],
  "domainGlossary": [
    "Session: a token-based mechanism that maintains user auth state",
    "Access Token: short-lived auth token (JWT)",
    "Refresh Token: long-lived token for Access Token reissuance"
  ],
  "userRoles": [
    "End user: uses the service",
    "Admin: manages system settings and users"
  ],
  "businessRules": [
    "Password: minimum 8 chars, requires alphanumeric + special char",
    "Login failure 5 times -> account locked for 30 minutes"
  ],
  "edgeCases": [
    "Under-14 signup attempt -> redirect to legal guardian consent flow",
    "Login attempt on locked account -> show unlock time"
  ]
}
```

### Spec (`.spec.json`)

A feature-level technical document derived from Contract. Each file represents exactly one feature. The filename is the feature key (`login.spec.json` -> feature key `login`). AI can create and update Spec files. Deletion requires user approval.

**Fixed fields** (always present, not defined by schema):

- `schema` (string, required): Schema ID
- `summary` (string, required): One-line feature summary
- `description` (string[], required): Detailed feature description
- `acceptanceCriteria` (string[], required): Completion criteria (verifiable conditions)
- `lastModified` (string YYYY-MM-DD, required): Last modified date
- `status` (string, required): `"draft"` / `"in-progress"` / `"done"`
- `sources` (string[], required): Implementation/test files (relative to project root)
- `contracts` (string[], required): Referenced Contract files (relative to Spec file)
- `dependsOnSpecs` (string[], optional): Dependent Spec files (relative to Spec file)

**Custom fields**: defined by the Schema document referenced in `schema`.

Example (with `default-spec` schema):

```json
{
  "schema": "default-spec",
  "summary": "Login processing and session issuance",
  "description": [
    "Validates user credentials and issues JWT-based sessions.",
    "Includes password retry limit and account lockout policy."
  ],
  "acceptanceCriteria": [
    "Valid email/password login returns a JWT token",
    "5 wrong password attempts locks account for 30 minutes",
    "Expired session request returns 401 response"
  ],
  "lastModified": "2026-03-09",
  "status": "in-progress",
  "sources": ["src/auth/login.ts", "src/auth/login.test.ts"],
  "contracts": ["./main.contract.json"],
  "dependsOnSpecs": ["./session.spec.json"],
  "modules": {
    "LoginService": "Handles login processing",
    "SessionManager": "Manages sessions",
    "RateLimiter": "Login retry limiting"
  },
  "interfaces": {
    "LoginService.authenticate()": "Performs authentication",
    "LoginService.validate()": "Validates input",
    "POST /auth/login": "Login API endpoint"
  },
  "dataFlow": [
    "1. Client -> LoginService.validate(): validate email/password input",
    "2. LoginService.validate() -> LoginService.authenticate(): pass validated credentials",
    "3. LoginService.authenticate() -> Database: query user record and compare password hash",
    "4. LoginService.authenticate() -> SessionManager: request session creation on auth success",
    "5. SessionManager -> Redis: store Refresh Token in whitelist",
    "6. SessionManager -> Client: return Access Token + Refresh Token"
  ],
  "errorHandling": {
    "InvalidCredentialsError": "Wrong password",
    "AccountLockedError": "Account locked due to retry limit"
  },
  "constraints": [
    "Session timeout: 30 min",
    "Login retry limit: 5 attempts / 30 min",
    "Password comparison: bcrypt"
  ]
}
```

**Spec is higher authority than code.** Code must always follow the confirmed Spec. If Spec and code conflict, code is wrong.

### Contract-Spec linking

Contract's `features` field (fixed, `Record<string, string>`) is the structural link to Spec files.

- Contract `features` key `"login"` -> Spec filename `login.spec.json` (1:1)
- Contract `features` key `"session"` -> Spec filename `session.spec.json` (1:1)

Rules:
1. Contract `features` key = Spec filename (part before `.spec.json`)
2. Spec `contracts` field points to referenced Contract files
3. Spec `summary`/`description` describes which Contract feature this Spec implements (human-readable)
4. Duplicate feature keys within the same Contract boundary are not allowed
5. Renaming a Spec file = changing the feature key (Contract `features` must be synchronized)

### `status` field

- `draft`: Spec is being written, not confirmed yet. Initial state.
- `in-progress`: Spec confirmed, implementation in progress. Transition after all Spec sections are confirmed.
- `done`: Implementation complete, consistency validation passed, all `acceptanceCriteria` met. Transition after code passes consistency check against Spec.

**Regression**: When `sources`, `contracts`, `dependsOnSpecs`, or `acceptanceCriteria` change on a `done` Spec, `status` reverts to `in-progress`.

### `acceptanceCriteria` field

Conditions that must be met for this Spec's implementation to be considered "done". AI uses these as a checklist during consistency validation.

**Authoring rules**:
- Each item must be a verifiable, specific condition. Vague expressions like "should work well" are not allowed.
- Include conditions derived from Contract's business rules and Edge Cases.
- Conditions derived from `constraints` and `errorHandling` may also be included.
- Recommended format: "When X, then Y" (input-result).

**Validation usage**: When transitioning `status` to `"done"`, AI verifies all items are satisfied in code. If any item is unmet, `"done"` transition is blocked.

### Spec detail level

- Include: module structure, file/class responsibilities, function/API names with short descriptions, inter-module data flow.
- Exclude: internal implementation logic, algorithm details, variable names, code snippets.

### Reference rules

- `contracts` field: relative path from the Spec file (e.g. `"./payment.contract.json"`).
- `sources` field: relative path from the project root (e.g. `"src/auth/login.ts"`).
- `dependsOnSpecs` field: relative path from the Spec file (e.g. `"../shared/auth-session.spec.json"`).

### Change history tracking

Spec files do not store history internally. Git handles it.

```bash
git log -- contract/auth/login.spec.json
git log --follow -- contract/auth/login.spec.json  # track renames
```

---

## Development Process

All processes follow Waterfall. Each stage starts only after the previous stage is complete. If you need to change a previous stage artifact, go back, update the document first, then re-run downstream stages.

### 1. New feature development

```text
Contract review -> Spec authoring/fix -> Code implementation -> Test authoring/execution -> Consistency validation
```

**Step 1: Contract review**
- Read related `.contract.json` files and identify business requirements for the target feature.
- Confirm the feature key exists in Contract's `features` field.
- If not defined, propose a Contract update to the user. Continue only after Contract is updated.

**Step 2: Spec authoring/fix**
- Create `{feature-key}.spec.json` in the same folder as related Contract files.
- Set `schema` to the appropriate Spec schema ID.
- Set `status` to `"draft"`.
- Fill `contracts` with relative paths to base Contract files.
- Fill `summary` and `description` to clearly state which Contract feature this Spec implements.
- Fill all custom fields defined by the schema (`modules`, `interfaces`, `dataFlow`, etc.).
- Define `acceptanceCriteria` with verifiable completion conditions.
- Add planned implementation file paths to `sources`.
- **All fields must be confirmed in this step.** After confirmation, set `status` to `"in-progress"` and continue.

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
- Check whether `modules`, `interfaces`, and `dataFlow` match Spec.
- Verify all `acceptanceCriteria` items are satisfied in code.
- **If mismatch exists, fix code.** Spec should not be changed to match code.
- After all validations pass, set `status` to `"done"` and update `lastModified` to today.

### 2. Existing code changes

```text
Impact analysis -> Contract/Spec review -> Spec update/fix -> Code update -> Test execution -> Consistency validation
```

**Step 1: Impact analysis**
- Find all Spec files whose `sources` include the target files.
- Check `contracts` and `dependsOnSpecs` in those Specs to identify chained impact scope.

**Step 2: Contract/Spec review**
- Read related Specs to understand current module structure and interfaces.
- Read Contract as well to ensure the change does not violate business rules.
- If the change conflicts with Contract business rules, notify the user and continue only after Contract update.

**Step 3: Spec update/fix**
- Determine whether the change affects Spec scope.
  - Interface changes, module add/remove, data flow changes -> Spec update is required.
  - Internal-only changes (refactoring, performance tuning) -> Spec update may be unnecessary, but verify `modules` is still accurate.
- If Spec update is required, update and confirm Spec first.
- If files are added/removed, update `sources`.
- Update `acceptanceCriteria` if completion conditions have changed.
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
- Verify all `acceptanceCriteria` items are satisfied.
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
  - Implementation bug -> check Spec `errorHandling` and Contract `edgeCases`.
  - Spec defect -> Spec failed to represent Contract correctly.

**Step 3: Spec update/fix (if needed)**
- If the bug is a missing technical case in Spec `errorHandling` or `constraints`, update those fields first.
- If the bug is a missing business case in Contract `edgeCases`, propose Contract update to user. After Contract update, update Spec.
- Add missing conditions to `acceptanceCriteria` if applicable.
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
- Verify all `acceptanceCriteria` items are satisfied.
- **If mismatch exists, fix code.**
- After all validations pass, set `status` to `"done"` and update `lastModified` to today.

---

## Contract/Spec Authoring Guide

### Contract authoring principles

- Use language that non-developers can understand.
- Do not include code, technical jargon, or implementation details.
- `features` keys must match Spec filenames exactly.
- Custom field content (overview, domainGlossary, etc.) should follow the schema's field types.
- All `string[]` fields: each element is one self-contained line of content.

### Spec authoring principles

- `summary` must state the feature in one line. `description` provides detailed explanation.
- `summary`/`description` must make it clear which Contract feature this Spec implements.
- Custom fields must follow the schema's type definitions:
  - `string`: prose text (e.g. summary)
  - `string[]`: ordered items (e.g. dataFlow, constraints)
  - `Record<string, string>`: key-value pairs (e.g. modules, interfaces, errorHandling)
  - `Record<string, object>`: dictionary with complex object values (e.g. API definitions, type definitions)
- `acceptanceCriteria` must contain verifiable, specific conditions.
- `sources` must list all related implementation and test files.
- `contracts` must list relative paths to base Contract files.
- Empty sections: `[]` for `string[]` fields, `{}` for `Record` fields.

### Reference path rules

- `contracts` field: relative path from the Spec file.
- `sources` field: relative path from the project root.
- `dependsOnSpecs` field: relative path from the Spec file.

### `lastModified` update rule

- Whenever any field changes, update `lastModified` to today's date.

---

## Validation System

- `cdd validate`: Schema/path/reference integrity + Schema conformance
- `cdd check`: Code <-> Spec <-> Contract consistency + `acceptanceCriteria` fulfillment

### `cdd validate` checks

- Contract/Spec `schema` field points to a valid Schema ID
- Fields marked `required: true` in Schema exist in the document
- Field value structure matches the type defined in Schema (minimal type-level validation only)
- Contract `features` keys match `*.spec.json` filenames in the same folder

### `cdd check` flow

1. Extract list of changed source files
2. Scan all Spec `sources` -> identify related Specs
3. Collect `contracts` from those Specs
4. Determine whether code follows Spec
5. Determine whether Spec follows Contract
6. Verify all `acceptanceCriteria` are fulfilled

---

## Edge Cases

- Feature rename: `git mv` Spec file + synchronize Contract `features` key
- Feature split: Existing + new files in same commit + synchronize Contract `features`
- Feature merge: Consolidate into one file, delete rest, same commit + synchronize Contract `features`
- Feature removal: Confirm removal from Contract `features`, delete Spec file with user approval
- Format change: Create new Schema, update `schema` field in documents, migrate fields as needed

---

## Prohibitions

- AI must not modify Contract files without user request. When the user explicitly asks to update Contract, AI may edit directly. Otherwise, AI should only propose changes.
- AI must not delete Spec files without user approval.
- Do not write code without checking Contract and Spec first.
- Do not include implementation internals, algorithm details, or code snippets in Spec.
- **Do not start implementation before Spec is confirmed.**
- **If Spec and code conflict, do not change Spec to match code. Always fix code to match Spec.**
- **If a better approach appears during implementation, do not change code first. Update Spec first.**
