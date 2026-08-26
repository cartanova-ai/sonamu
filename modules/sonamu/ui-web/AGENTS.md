# Guide for Coding Agents - modules/sonamu/ui-web

Inherits rules from:

- `../../../AGENTS.md`
- `../AGENTS.md`

## Package role

- Static UI-web build package for Sonamu UI.

## Required checks

- `mise exec -- pnpm --filter ui-web build`
- `mise exec -- pnpm --filter ui-web dev` for behavior verification when needed

## Validation policy

- If UI user flows changed, include runtime browser validation (Playwright MCP policy from root applies).

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
