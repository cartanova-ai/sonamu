# Guide for Coding Agents - modules/react-components

Inherits root rules from `../../AGENTS.md`.

## Package role

- Shared React component library.

## Required checks

- `pnpm --filter @sonamu-kit/react-components build`
- `pnpm --filter @sonamu-kit/react-components lint`

## Frontend policy

- Follow React best-practice skill policy from root workflow contract.
- Add focused validation for changed component behavior.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
