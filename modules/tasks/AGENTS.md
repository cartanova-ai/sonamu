# Guide for Coding Agents - modules/tasks

Inherits root rules from `../../AGENTS.md`.

## Package role
- Distributed task queue library.

## Required checks
- `pnpm --filter @sonamu-kit/tasks check`
- `pnpm --filter @sonamu-kit/tasks test`
- `pnpm --filter @sonamu-kit/tasks build`

## Testing policy
- For scheduling/retry/distribution logic changes, add regression tests before implementation completion.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
