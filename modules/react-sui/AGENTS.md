# Guide for Coding Agents - modules/react-sui

Inherits root rules from `../../AGENTS.md`.

## Package role

- Semantic UI-oriented React component package.

## Required checks

- `pnpm --filter @sonamu-kit/react-sui dev` (interactive verification when needed)
- `pnpm --filter @sonamu-kit/react-sui build__deprecated` when build-path validation is required

## Frontend policy

- Follow React best-practice skill policy from root workflow contract.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (oxlint + oxfmt) must pass before handoff.
