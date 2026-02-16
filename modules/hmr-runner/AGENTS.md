# Guide for Coding Agents - modules/hmr-runner

Inherits root rules from `../../AGENTS.md`.

## Package role
- Runner for HMR-enabled applications.
- Changes can impact development runtime behavior broadly.

## Required checks
- `pnpm --filter @sonamu-kit/hmr-runner typecheck`
- `pnpm --filter @sonamu-kit/hmr-runner lint`
- `pnpm --filter @sonamu-kit/hmr-runner test`
- `pnpm --filter @sonamu-kit/hmr-runner build`

## Testing policy
- Add regression tests for lifecycle/restart/failure-handling behavior changes.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
