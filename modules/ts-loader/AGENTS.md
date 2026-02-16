# Guide for Coding Agents - modules/ts-loader

Inherits root rules from `/Users/Nebuleto/Workspace/sonamu/AGENTS.md`.

## Package role
- TypeScript loader utility used by Sonamu toolchain.

## Required checks
- `pnpm --filter @sonamu-kit/ts-loader test`
- `pnpm --filter @sonamu-kit/ts-loader build`

## Testing policy
- For module resolution/loader behavior changes, add targeted regression tests.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
