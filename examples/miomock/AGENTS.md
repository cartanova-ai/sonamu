# Guide for Coding Agents - examples/miomock

Inherits root rules from `../../AGENTS.md`.

## Project role
- `examples/miomock` is the Sonamu sample/integration test application.
- It is used for framework validation and practical pattern verification.

## CDD policy (miomock-only)
- This scope follows Contract-Driven Development (CDD). Detailed policy: `.agents/workflow/cdd.md`
- Planning gate (mandatory): before any detailed implementation plan, lock Contract/Spec first.
  - Confirm relevant Contract requirements and fixed Spec sections.
  - If Spec is missing or outdated, create/update Spec first, then write implementation plan.
- Implementation gate (mandatory): after code/test changes or any request to modify an existing feature, finish artifact reconciliation before closing the work.
  - Review whether the target Spec and related artifacts still reflect the confirmed behavior, interface, constraints, error handling, and file layout.
  - Minimum reconciliation scope: the target Spec, referenced Contracts, related Specs from `dependsOnSpecs`, and live implementation/test files in changed or planned `sources`.
  - If mismatch exists, fix code first to match the current Spec unless the request explicitly changes the feature.
  - If the requested or confirmed change requires Spec updates, update or route Spec work before closing the request.
  - If Contract drift is found and the user did not explicitly request Contract edits, stop and report it instead of silently continuing.
- Contract files are human-owned SSoT. AI must not modify them without user request. When the user explicitly asks to update Contract, AI may edit directly. Otherwise, AI should only propose changes.

## Structure
- `examples/miomock/api`: backend API and integration tests.
- `examples/miomock/web`: frontend sample app.

## Core validation flow
1. Start DB container:
   - `cd examples/miomock/api/database && docker compose up -d`
2. Run migration:
   - `cd examples/miomock/api && pnpm sonamu migrate run`
3. Seed fixtures:
   - `pnpm seed`
4. Run tests (integration and feature tests use the same policy):
   - Check readiness: `pnpm sonamu test -s`
   - If the output includes `ready: true`, run tests with `pnpm sonamu test`
   - If not ready, fallback to `pnpm test`
   - Quick usage (see `modules/docs/en/tools-and-cli/sonamu-cli/test.mdx`):
     - All tests: `pnpm sonamu test`
     - Specific file: `pnpm sonamu test src/application/department/department.model.test.ts`
     - Test-name filter: `pnpm sonamu test --pattern "Department"`
     - Trace output (Naite): `pnpm sonamu test -t`

## Entity/migration rule
- Entity updates and migration operations are primarily user-driven via Sonamu UI.
- If direct file edits are needed, request explicit user confirmation first.

## i18n rule
- For miomock i18n, update source data in `examples/miomock/api`.
- Do not treat `examples/miomock/web` as i18n source-of-truth.

## Generated-file notes
- Generated artifacts in `api/src/application` (for example `sonamu.generated.ts`, `sonamu.generated.sso.ts`, `queries.generated.ts`) must not be edited directly.
- Use `sonamu.lock` + sync workflow for regeneration.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
