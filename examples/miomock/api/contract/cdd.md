# Contract-Driven Development (CDD)

This project follows Contract-Driven Development (CDD). All development work must follow the rules below.

## Core Principles

- The `.contract.json` files under the `contract/` directory are the Single Source of Truth (SSoT) for this project.
- All development follows a **Waterfall process**. Move to the next stage only after the current stage is completed.
- Authority flows in this order: **Contract -> Spec -> Code**.
  - Code must always follow Spec.
  - Spec must always follow Contract.
- **1 Contract Feature = 1 Spec File**. Each feature in Contract's `Features/Capabilities` maps to exactly one Spec file. Shared infrastructure across features may be separated into `shared/*.spec.json`.
- Even if a better structure appears during implementation, do not change code first. Update Spec first, then update code.
- Contract is human-managed. AI must not modify Contract files without user request. When the user explicitly asks to update Contract, AI may edit directly. Otherwise, AI should only propose changes.
- Code-document consistency is verified by AI automated validation (1st pass) and review checklist (2nd pass for feature mapping/coverage).

## Project Structure

```text
project/
|- contract/
|  |- main.contract.json          # project root contract
|  |- {domain}/
|  |  |- main.contract.json       # domain representative contract
|  |  |- {sub-contract}.contract.json
|  |  |- {feature-key}.spec.json  # 1 feature = 1 spec file
|  |- shared/
|  |  |- {shared-infra}.spec.json # cross-feature shared infrastructure
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
|  |  |- login.spec.json           # login feature spec (1:1)
|  |  |- session.spec.json         # session feature spec (1:1)
|  |  \- password-reset.spec.json  # password-reset feature spec (1:1)
|  |- payment/
|  |  |- main.contract.json
|  |  |- checkout.contract.json
|  |  |- checkout.spec.json        # checkout feature spec (1:1)
|  |  \- refund.spec.json          # refund feature spec (1:1)
|  \- shared/
|     \- auth-session.spec.json    # shared session infrastructure
|- src/
|  |- auth/login.ts
|  |- auth/login.test.ts
|  \- payment/checkout.ts
\- ...
```

- Contract: `*.contract.json` - folder-based tree structure, with `main.contract.json` as the folder representative.
- Spec: `*.spec.json` - one file per feature, placed in the same folder as related Contract files. The filename is the feature key (`login.spec.json` -> feature key `login`).

## Document Model

### Contract (`.contract.json`)

A business-logic document that non-developers can read. AI must treat this file as **read-only**. If an update is needed, AI should only propose the change to the user.

```json
{
  "lastModified": "YYYY-MM-DD",
  "content": ["## Overview", "", "Markdown lines as string array", ...]
}
```

`content` is a `string[]` where each element is one line of Markdown.

`content` fixed sections (compliance verified via review checklist):

`Overview -> Domain Glossary -> Features/Capabilities -> User Roles/Actors -> Business Rules/Constraints -> Edge Cases`

### Spec (`.spec.json`)

A feature-level technical document derived from Contract. Each file represents exactly one feature. AI can create and update Spec files. Deletion requires user approval.

```json
{
  "schemaVersion": 1,
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
  "lastModified": "YYYY-MM-DD",
  "status": "draft | in-progress | done",
  "sources": ["src/auth/login.ts", "src/auth/login.test.ts"],
  "contracts": ["./auth.contract.json"],
  "dependsOnSpecs": ["./session.spec.json"],
  "types": {
    "LoginRequest": "{ email: string; password: string }",
    "LoginResponse": "{ accessToken: string; refreshToken: string }"
  },
  "api": {
    "POST /auth/login": {
      "description": "Authenticate user and issue tokens",
      "request": "LoginRequest",
      "response": "LoginResponse",
      "errors": [
        "401 InvalidCredentialsError: Wrong email or password",
        "423 AccountLockedError: Account locked due to retry limit"
      ]
    }
  },
  "modules": {
    "LoginService": "Handles login processing",
    "SessionManager": "Manages sessions"
  },
  "interfaces": {
    "LoginService.authenticate()": "Performs authentication",
    "LoginService.validate()": "Validates input"
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
    "AccountLockedError": "Account locked"
  },
  "constraints": ["Session timeout: 30 min", "Login retry limit: 5 attempts"]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `number` | Y | Schema version |
| `summary` | `string` | Y | One-line feature summary |
| `description` | `string[]` | Y | Detailed feature description |
| `acceptanceCriteria` | `string[]` | Y | Completion criteria (verifiable conditions) |
| `lastModified` | `string` | Y | Last modified date (YYYY-MM-DD) |
| `status` | `string` | Y | `"draft"` / `"in-progress"` / `"done"` |
| `sources` | `string[]` | Y | Implementation/test files (relative to project root) |
| `contracts` | `string[]` | Y | Referenced Contract files (relative to Spec file) |
| `dependsOnSpecs` | `string[]` | N | Dependent Spec files (relative to Spec file) |
| `types` | `Record<string, string>` | N | Type definitions (key: type name, value: type expression) |
| `api` | `Record<string, object>` | N | API endpoints (key: `METHOD /path`, value: `{ description, request, response, errors }`) |
| `modules` | `Record<string, string>` | Y | Module structure (key: module name, value: role) |
| `interfaces` | `Record<string, string>` | Y | Functions/APIs (key: function name, value: description) |
| `dataFlow` | `string[]` | Y | Inter-module data flow |
| `errorHandling` | `Record<string, string>` | Y | Error handling (key: error name, value: trigger condition) |
| `constraints` | `string[]` | Y | Technical constraints |

**Empty section notation**: `string[]` -> `[]`, `Record<string, string>` -> `{}`, `Record<string, object>` -> `{}`

**Spec is higher authority than code.** Code must always follow the confirmed Spec. If Spec and code conflict, code is wrong.

### Contract-Spec linking

Contract is not extended as a structural source of feature keys. **Spec references Contract unidirectionally.**

1. **Spec filename = feature key**: `login.spec.json` -> `login`
2. **`contracts` field** points to referenced Contract files
3. **`summary`/`description`** describes which Contract feature this Spec implements (human-readable)
4. Duplicate feature keys within the same Contract boundary are not allowed
5. Renaming a Spec file = changing the feature key

### `status` field

| Value | Meaning | Transition condition |
|---|---|---|
| `draft` | Spec is being written, not confirmed yet | Initial state |
| `in-progress` | Spec confirmed, implementation in progress | After all Spec sections are confirmed |
| `done` | Implementation complete, consistency validation passed, all `acceptanceCriteria` met | After code passes consistency check against Spec |

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
- Confirm the feature is defined under Contract `Features/Capabilities`.
- If not defined, propose a Contract update to the user. Continue only after Contract is updated.

**Step 2: Spec authoring/fix**
- Create `{feature-key}.spec.json` in the same folder as related Contract files.
- Set `status` to `"draft"`.
- Fill `contracts` with relative paths to base Contract files.
- Fill `summary` and `description` to clearly state which Contract feature this Spec implements.
- Fill all structured fields (`modules`, `interfaces`, `dataFlow`, `errorHandling`, `constraints`).
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
  - Implementation bug -> check Spec `errorHandling` and Contract `Edge Cases`.
  - Spec defect -> Spec failed to represent Contract correctly.

**Step 3: Spec update/fix (if needed)**
- If the bug is a missing technical case in Spec `errorHandling` or `constraints`, update those fields first.
- If the bug is a missing business case in Contract `Edge Cases`, propose Contract update to user. After Contract update, update Spec.
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
- Organize Contract files by domain or business capability, not by UI flow or implementation sequence.
- Domain names should be short, clear, and reusable. Prefer names that express responsibility directly rather than screen names, temporary workflows, or technical layers.
- The root Contract should describe the top-level domain map of the scope, and each domain Contract should describe the features owned by that domain.
- `Overview`: summarize the business scope of the Contract, what part of the product or domain it governs, and what is explicitly in or out of scope.
- `Domain Glossary`: define project-specific terms, domain nouns, and recurring business concepts that readers need in order to interpret the rest of the Contract consistently.
- `Features/Capabilities`: describe each feature in business terms, including what the feature provides, what outcome the user receives, and what important boundaries or decisions apply. This section may use subheadings per feature when needed, but it must remain business-facing and implementation-agnostic.
- `User Roles/Actors`: list the human roles and system actors that participate in the Contract scope, and describe each actor in terms of responsibility or interaction, not implementation.
- `Business Rules/Constraints`: record the stable rules, policies, scope limits, and cross-feature constraints that govern the Contract scope. Put rules here when they affect multiple features or define non-optional product behavior.
- `Edge Cases`: describe business-level boundary conditions, failure expectations, ambiguous inputs, and fallback decisions that the product must handle consistently.
- Do not put code structure, API fields, database design, algorithms, file paths, class names, prompt wiring, or other implementation-specific details into Contract sections.

### Spec authoring principles

- `summary` must state the feature in one line. `description` provides detailed explanation.
- `summary`/`description` must make it clear which Contract feature this Spec implements.
- `modules` and `interfaces` use `Record<string, string>` format (key: name, value: description).
- In `interfaces`, include only function/API names and short descriptions (no signatures or implementation logic).
- `types` uses `Record<string, string>` format (key: type name, value: type expression). Define domain-specific types used in `api`, `interfaces`, etc.
- `api` uses `Record<string, object>` format (key: `"METHOD /path"`, value: `{ description, request, response, errors }`). `errors` is `string[]` with format `"HTTP_CODE ErrorName: description"`.
- `dataFlow` and `constraints` use `string[]` format.
- `errorHandling` uses `Record<string, string>` format (key: error name, value: trigger condition).
- `acceptanceCriteria` must contain verifiable, specific conditions.
- `sources` must list all related implementation and test files.
- `contracts` must list relative paths to base Contract files.
- Empty sections: `[]` for `string[]` fields, `{}` for `Record<string, string>` fields.

### Reference path rules

- `contracts` field: relative path from the Spec file (e.g. `"./payment.contract.json"`).
- `sources` field: relative path from project root (e.g. `"src/auth/login.ts"`).
- `dependsOnSpecs` field: relative path from the Spec file (e.g. `"../shared/auth-session.spec.json"`).

### `lastModified` update rule

- Whenever any Spec field changes, update `lastModified` to today's date.

---

## CDD CLI (`@sonamu-kit/cdd`)

The `cdd` CLI tool automates CDD workflow tasks. Run via `pnpm cdd <command>`.

### Commands

| Command | Description |
|---|---|
| `cdd init [dir]` | Initialize a CDD project (creates `contract/`, `main.contract.json`, `cdd.md`) |
| `cdd tree` | Display Contract/Spec tree grouped by domain with status colors |
| `cdd status` | Show project dashboard (Contract/Spec counts, status breakdown) |
| `cdd status <file>` | Spec/Contract status with relationship info (contracts, deps, dependents) |
| `cdd validate` | Verify schema/path/reference integrity (file existence, path resolution, required fields) |
| `cdd impact <file>` | Analyze source file change impact (direct Specs, chain Contracts, indirect Specs) |
| `cdd check` | Verify Code-Spec-Contract consistency + `acceptanceCriteria` fulfillment |
| `cdd spec create <name>` | Create a Spec template. Requires `--domain <name>` or `--contract <path>` |
| `cdd spec set-status <spec> <status>` | Change Spec status |
| `cdd spec list` | List Specs. Filters: `--status`, `--domain`, `--contract` |
| `cdd spec get <spec>` | Show full Spec or a specific field (`--field`) |
| `cdd spec set <spec>` | Update a Spec field (`--field`, `--value`, `--json`) |
| `cdd spec add <spec>` | Add an item to an array/map field (`--field`, `--value`, `--key`) |
| `cdd spec remove <spec>` | Remove an item from an array/map field (`--field`, `--index`/`--value`/`--key`) |
| `cdd spec blame <feature>` | Contributor analysis per Spec (ownership, score, AI role summary) |
| `cdd spec log <feature>` | Change timeline grouped by time period and author |
| `cdd spec explain <feature>` | AI-powered diff analysis: what changed, why, and impact level |
| `cdd source blame <file>` | Contributor analysis per source file (ownership, score, AI role summary) |
| `cdd source log <file>` | Source file change timeline grouped by time period and author |
| `cdd source explain <file>` | AI-powered source file diff analysis: what changed, why, and impact level |

### Common Options

- `--cwd <dir>` : Set working directory (default: current directory)
- `--raw` / `--json` : Force raw JSON output (auto-enabled in pipe/CI environments)
- `-h, --help` : Show help

### Git + AI Options (blame, log, explain)

- `--since=<date>` : Start date filter (ISO 8601, e.g. `2025-01-01`)
- `--until=<date>` : End date filter (ISO 8601, default: HEAD)
- `--group-by=day|week|month` : Grouping interval for `spec log` / `source log` (default: `day`)
- `--commit=<hash>` : Analyze a single commit for `spec explain` / `source explain`

AI uses `claude --model haiku` via local CLI. If AI is unavailable, AI-generated fields are returned as empty strings.

### Usage Examples

#### Spec CRUD

```bash
# List in-progress specs
pnpm cdd spec list --status in-progress

# Show full spec
pnpm cdd spec get signin

# Show a specific field
pnpm cdd spec get signin --field modules

# Update a field
pnpm cdd spec set signin --field summary --value "Updated summary"

# Add a constraint
pnpm cdd spec add signin --field constraints --value "New constraint"

# Remove a module
pnpm cdd spec remove signin --field modules --key "OldModule"
```

#### Git + AI: "Who should I ask about this feature?"

```bash
# Contributor analysis for a spec
pnpm cdd spec blame signin
# Output: primary owner, each contributor's ownership %, score, and AI-inferred role

# Scoped to a date range
pnpm cdd spec blame signin --since=2025-01-01 --until=2025-06-01
```

#### Git + AI: "What happened to this feature recently?"

```bash
# Weekly changelog for a spec
pnpm cdd spec log signin --group-by=week

# Monthly changelog for a specific period
pnpm cdd spec log signin --group-by=month --since=2025-01-01
# Output: timeline grouped by period -> author, with AI summary and phase label
```

#### Git + AI: "Why did this change?"

```bash
# Explain all changes in a date range
pnpm cdd spec explain signin --since=2025-03-01

# Explain a single commit
pnpm cdd spec explain signin --commit=a1b2c3d
# Output: per-section what/why/impact analysis, overall summary, breaking changes
```

#### Git + AI for source files

```bash
# Contributor analysis for a source file
pnpm cdd source blame src/application/session/session.types.ts

# Source file can also be referenced by filename
pnpm cdd source blame session.types.ts

# Weekly changelog for a source file
pnpm cdd source log session.types.ts --group-by=week

# Explain changes in a source file
pnpm cdd source explain session.types.ts --since=2025-03-01

# Explain a single commit for a source file
pnpm cdd source explain session.types.ts --commit=a1b2c3d
```

#### Pipe-friendly output

```bash
# JSON output for scripting
pnpm cdd spec list --raw | jq '.[].status'
pnpm cdd spec get signin --raw | jq '.modules'
pnpm cdd spec blame signin --raw | jq '.contributors[0]'
```

### Programmatic API

The package also exports a library API for use in scripts:

```ts
import { loadProject, validateProject, findContractDir } from "@sonamu-kit/cdd";

const contractDir = findContractDir(process.cwd());
const project = await loadProject(contractDir);
const issues = validateProject(project);
```

---

## Edge Cases

| Situation | Handling |
|---|---|
| Feature rename | `git mv` to rename Spec file |
| Feature split | Keep/delete existing file + create new files, in the same commit |
| Feature merge | Consolidate into one file, delete the rest, in the same commit |
| Feature removal | Confirm removal from Contract, delete Spec file with user approval |

---

## Prohibitions

- AI must not modify Contract files without user request. When the user explicitly asks to update Contract, AI may edit directly. Otherwise, AI should only propose changes.
- AI must not delete Spec files without user approval.
- Do not write code without checking Contract and Spec first.
- Do not include implementation internals, algorithm details, or code snippets in Spec.
- **Do not start implementation before Spec is confirmed.**
- **If Spec and code conflict, do not change Spec to match code. Always fix code to match Spec.**
- **If a better approach appears during implementation, do not change code first. Update Spec first.**
