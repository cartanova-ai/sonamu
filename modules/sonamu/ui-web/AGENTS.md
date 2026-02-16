# Guide for Coding Agents - modules/sonamu/ui-web

Inherits rules from:
- `/Users/Nebuleto/Workspace/sonamu/AGENTS.md`
- `/Users/Nebuleto/Workspace/sonamu/modules/sonamu/AGENTS.md`

## Package role
- Static UI-web build package for Sonamu UI.

## Required checks
- `pnpm --filter ui-web build`
- `pnpm --filter ui-web dev` for behavior verification when needed

## Validation policy
- If UI user flows changed, include runtime browser validation (Playwright MCP policy from root applies).

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
