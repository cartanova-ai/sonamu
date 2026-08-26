# Guide for Coding Agents - modules/hmr-hook

Inherits root rules from `../../AGENTS.md`.

## Package role

- Core HMR hook runtime module.
- Behavior regressions here can break hot-reload flow across dependent packages.

## Required checks

- `mise exec -- pnpm --filter @sonamu-kit/hmr-hook typecheck`
- `mise exec -- pnpm --filter @sonamu-kit/hmr-hook lint`
- `mise exec -- pnpm --filter @sonamu-kit/hmr-hook test`
- `mise exec -- pnpm --filter @sonamu-kit/hmr-hook build`

## Testing policy

- Add regression tests for non-obvious runtime edge cases.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
