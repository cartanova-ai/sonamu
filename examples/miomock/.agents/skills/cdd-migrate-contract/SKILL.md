---
name: cdd-migrate-contract
description: "Migrate contract/ directory from JSON-based structure to single markdown contract. Use /cdd-migrate-contract to execute."
model: opus
---

# Contract Directory Migration

One-time migration: restructure `contract/` from JSON-based to markdown-based.

## What is business logic

Business logic is domain-level knowledge that exists in code but is scattered and mixed with implementation details. The contract document describes it in cohesive form.

**Include:**
- Domain rules and constraints
- Decision rationale when not obvious
- Domain workflows
- Glossary, roles, edge cases
- Cross-domain relationships

**Exclude:**
- Implementation details (file paths, function names, API endpoints, data schemas)
- UI structure
- Code conventions (these belong in `rules/*.rules.json`)
- JSON metadata (`schema`, `lastModified`, `schemaVersion`, `features` key-value pairs)

All output to the user must be in Korean.

## Procedure

1. Read all `*.contract.json`, `*.spec.json`, and any other documents (e.g. `planning.md`) under `contract/`.
2. Extract business logic content from every source. Discard metadata and implementation details.
3. Write `contract/main.contract.md` — organize the content in whatever structure best fits the project. There is no fixed template.
4. Delete all `*.contract.json`, `*.spec.json`, `schemas/`, and any files fully absorbed into the contract. Keep `rules/*.rules.json`.
5. Verify: `main.contract.md` exists, no JSON contracts or specs remain, no business logic was lost.
