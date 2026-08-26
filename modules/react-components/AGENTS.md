# Guide for Coding Agents - modules/react-components

Inherits root rules from `../../AGENTS.md`.

## Package role

- Shared React component library.

## Required checks

- `mise exec -- pnpm --filter @sonamu-kit/react-components build`
- `mise exec -- pnpm --filter @sonamu-kit/react-components lint`

## Frontend policy

- Follow the React best-practice skill policy in the root `AGENTS.md`.
- Add focused validation for changed component behavior.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
