# Guide for Coding Agents - modules/ts-loader

Inherits root rules from `../../AGENTS.md`.

## Package role

- TypeScript loader utility used by Sonamu toolchain.

## Required checks

- `mise exec -- pnpm --filter @sonamu-kit/ts-loader test`
- `mise exec -- pnpm --filter @sonamu-kit/ts-loader build`

## Testing policy

- For module resolution/loader behavior changes, add targeted regression tests.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
