# Guide for Coding Agents - modules/hmr-runner

Inherits root rules from `../../AGENTS.md`.

## Package role

- Runner for HMR-enabled applications.
- Changes can impact development runtime behavior broadly.

## Required checks

- `mise exec -- pnpm --filter @sonamu-kit/hmr-runner typecheck`
- `mise exec -- pnpm --filter @sonamu-kit/hmr-runner lint`
- `mise exec -- pnpm --filter @sonamu-kit/hmr-runner test`
- `mise exec -- pnpm --filter @sonamu-kit/hmr-runner build`

## Testing policy

- Add regression tests for lifecycle/restart/failure-handling behavior changes.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
