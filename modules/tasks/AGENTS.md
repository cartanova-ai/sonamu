# Guide for Coding Agents - modules/tasks

Inherits root rules from `../../AGENTS.md`.

## Package role

- Distributed task queue library.

## Required checks

- `mise exec -- pnpm --filter @sonamu-kit/tasks check`
- `mise exec -- pnpm --filter @sonamu-kit/tasks test`
- `mise exec -- pnpm --filter @sonamu-kit/tasks build`

## Testing policy

- For scheduling/retry/distribution logic changes, add regression tests before implementation completion.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
