# Guide for Coding Agents - examples/miomock/api

Inherits rules from:

- `../../../AGENTS.md`
- `../AGENTS.md`

## API-specific policy

- This package is the primary integration-test target for Sonamu core changes.
- Prefer running API commands from this directory.
- This package is the source-of-truth for miomock i18n changes.

## Commands

- `pnpm dev`
- `pnpm build`
- `pnpm start`
- `pnpm sonamu test` (preferred when Sonamu test runner is ready)
- `pnpm test` (fallback when Sonamu test runner is unavailable)
- `pnpm sonamu migrate run`
- `pnpm seed`
- `pnpm dump`

## Implementation/testing notes

- For both integration tests and feature-level test code execution:
  - Check readiness first with `pnpm sonamu test -s`.
  - If output includes `ready: true`, use `pnpm sonamu test`.
  - If not ready, fallback to `pnpm test`.
  - Quick usage (see `modules/docs/en/tools-and-cli/sonamu-cli/test.mdx`):
    - All tests: `pnpm sonamu test`
    - Specific file: `pnpm sonamu test src/application/department/department.model.test.ts`
    - Test-name filter: `pnpm sonamu test --pattern "Department"`
    - Trace output (Naite): `pnpm sonamu test -t`
- Place domain tests in `src/application/{domain}/{domain}.model.test.ts`.
- Place framework behavior tests in `src/sonamu-test/*.test.ts`.
- For non-obvious model/query behavior changes, add regression tests before patching.

## Logging rule

- In Model/Frame/Agent implementation classes, prefer `this.logger`.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (oxlint + oxfmt) must pass before handoff.
