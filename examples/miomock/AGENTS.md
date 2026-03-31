# Guide for Coding Agents - examples/miomock

Inherits root rules from `../../AGENTS.md`.

## Project role
- `examples/miomock` is the Sonamu sample/integration test application.
- It is used for framework validation and practical pattern verification.

## CDD policy (miomock-only)
- This scope follows Contract-Driven Development (CDD). Detailed policy: `.agents/workflow/cdd.md`

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
