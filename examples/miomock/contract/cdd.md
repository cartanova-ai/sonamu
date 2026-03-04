# Contract-Driven Development (CDD) for miomock

This document defines how CDD is applied in `examples/miomock`.

## Scope
- Applies to all work under `examples/miomock/**`.
- Includes feature work, refactoring that changes interfaces or module structure, and bug fixes.

## Authority order
1. Contract (`contract/contract.md`)
2. Spec (`contract/specs/{domain}/{feature}.md`)
3. Code and tests

Code and tests must follow Spec, and Spec must follow Contract.

## Mandatory gates

### 1) Planning gate: lock Contract/Spec before implementation planning
Before creating a detailed implementation plan:
- Read relevant Contract requirements first.
- Read or create the related Spec document.
- Confirm Spec fixed sections are complete and aligned with Contract.
- Only after Spec is fixed, write detailed implementation steps.

If a better structure is discovered during planning:
- Do not plan against undocumented structure.
- Update Spec first, then continue planning.

### 2) Implementation gate: verify Contract/Spec alignment after coding
After implementation and tests:
- Verify Modules/Components, Interfaces, and Data Flow still match Spec.
- Verify business behaviors and constraints still match Contract.
- If mismatch exists, fix code/tests to match Spec.
- If the change requires interface/structure changes, update Spec first, then re-apply code changes.

## Document model

### Contract (`contract/contract.md`)
- Single source of truth for business requirements.
- Human-managed and read-only for AI agents.
- If Contract change is needed, propose it to the user and wait for user update.
- Recommended fixed section order:
  - Overview
  - Domain Glossary
  - Features/Capabilities
  - User Roles/Actors
  - Business Rules/Constraints
  - Edge Cases

Contract fixed sections must explain:

- `Overview`
  - Project purpose and why it exists.
  - Must be understandable by non-developers.
- `Domain Glossary`
  - Definitions of domain terms used in the project.
  - Must reduce ambiguity for cross-team communication.
- `Features/Capabilities`
  - List of provided business features and per-feature business rules.
  - Each feature should map to one or more Spec documents.
- `User Roles/Actors`
  - Who uses the system and what role/authority each actor has.
- `Business Rules/Constraints`
  - Cross-feature global business rules (not per-feature internals).
  - Examples: data retention rules, account state policies, amount/limit policies.
- `Edge Cases`
  - Business-level boundary and exception scenarios.
  - Include business decisions for each case in a non-technical form.

All fixed sections are mandatory. If a section has no applicable content, write `N/A`.

Contract frontmatter:

```yaml
---
lastModified: YYYY-MM-DD
---
```

### Spec (`contract/specs/{domain}/{feature}.md`)
- Technical document derived from Contract.
- AI can create and update Spec; deletion is user decision.
- Required sections:
  - Summary
  - Modules/Components
  - Interfaces
  - Data Flow
  - Error Handling
  - Technical Constraints
- Summary must explicitly state which Contract feature/capability is implemented.
- Do not include low-level implementation details (algorithm internals, variable-level design, code snippets).

Spec fixed sections must explain:

- `Summary`
  - What feature this Spec covers.
  - Which Contract feature/capability it implements.
- `Modules/Components`
  - Related modules/files/classes and each responsibility.
- `Interfaces`
  - Function/API names and short responsibility notes.
  - Do not include implementation internals.
- `Data Flow`
  - End-to-end flow between modules in execution order.
  - Explain how requests/data move across boundaries.
- `Error Handling`
  - Expected error cases and handling strategy per case.
- `Technical Constraints`
  - Performance, environment, and infrastructure constraints.
  - Include boundary situations such as concurrency, timeout, connection/resource failure.

All fixed sections are mandatory. If a section has no applicable content, write `N/A`.

Spec frontmatter:

```yaml
---
lastModified: YYYY-MM-DD
sources:
  - src/path/to/file.ts
  - src/path/to/file.test.ts
dependencies:
  - domain/another-feature
---
```

## Standard workflow

### New feature
1. Confirm target feature/capability in Contract.
2. Create/fix Spec and complete all required sections.
3. Build detailed implementation plan from fixed Spec.
4. Implement code according to Spec.
5. Add/update tests and run validation.
6. Run Contract/Spec alignment check; fix mismatches.

### Existing code change
1. Find affected Spec(s) from `sources` and dependency chain.
2. Check whether change impacts interfaces/module boundaries/data flow.
3. If yes, update Spec first and then plan implementation.
4. Modify code and tests.
5. Validate and run alignment check.

### Bug fix
1. Identify root cause and affected sources.
2. Check related Spec + Contract constraints/edge cases.
3. If Spec is missing needed technical/error handling constraints, update Spec first.
4. Fix code and add reproduction test.
5. Re-run tests and alignment check.

## Alignment checklist
- Contract feature/capability mapping is explicit in Spec Summary.
- Spec `sources` includes all changed implementation files and test files.
- Implemented interfaces and module boundaries match Spec.
- Data flow and error handling behavior match Spec.
- Business rules and edge behaviors match Contract.
- Any unresolved mismatch is treated as code defect until corrected.
