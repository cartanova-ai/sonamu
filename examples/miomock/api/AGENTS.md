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
- `pnpm test`
- `pnpm sonamu migrate run`
- `pnpm seed`
- `pnpm dump`

## Implementation/testing notes
- Place domain tests in `src/application/{domain}/{domain}.model.test.ts`.
- Place framework behavior tests in `src/sonamu-test/*.test.ts`.
- For non-obvious model/query behavior changes, add regression tests before patching.

## Logging rule
- In Model/Frame/Agent implementation classes, prefer `this.logger`.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
