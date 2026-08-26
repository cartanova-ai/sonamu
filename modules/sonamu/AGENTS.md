# Guide for Coding Agents - modules/sonamu

Inherits root rules from `../../AGENTS.md`.

## Module role

- `modules/sonamu` is the framework core.
- Changes here can affect all Sonamu-based projects.

## High-impact areas

- `src/database/puri.ts`, `src/database/puri.types.ts`
  - Type inference and nullability behavior are high-risk.
  - Validate type-level and runtime behavior together.
- `src/syncer/template*.ts`
  - Template changes affect generated code across projects.
  - Verify regeneration impact in miomock before finalizing.
- `src/database/migrator.ts`
  - Migration behavior changes require extra caution and explicit evidence.
- `src/api/config.ts`
  - Validate runtime/development path resolution differences.
- `bin/cli.js`
  - Validate CLI entry behavior after build.

## Validation requirements

- Minimum package checks:
  - `mise exec -- pnpm --filter sonamu build`
  - `mise exec -- pnpm --filter sonamu test:type`
- Integration regression checks:
  - `mise exec -- pnpm --filter miomock-api test`
- If templates/generation paths changed, validate sync result and generated outputs in miomock.

## Notes

- Sonamu internal tests are limited. Prefer miomock integration verification as mandatory evidence.
- HMR-related changes often involve `@sonamu-kit/hmr-hook`, `@sonamu-kit/hmr-runner`, `@sonamu-kit/ts-loader`; review cross-package impact.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
