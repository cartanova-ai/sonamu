# Guide for Coding Agents - modules/react-sui

Inherits root rules from `../../AGENTS.md`.

## Package role

- Semantic UI-oriented React component package.

## Required checks

- `mise exec -- pnpm --filter @sonamu-kit/react-sui dev` (interactive verification when needed)
- `mise exec -- pnpm --filter @sonamu-kit/react-sui build__deprecated` when build-path validation is required

## Frontend policy

- Follow the React best-practice skill policy in the root `AGENTS.md`.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
