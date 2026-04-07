# Guide for Coding Agents - examples/miomock/web

Inherits rules from:

- `../../../AGENTS.md`
- `../AGENTS.md`

## Web-specific policy

- React + Vite sample frontend for integration validation.
- When user-flow behavior changes, include runtime/browser validation (Playwright MCP policy from root applies).
- Do not use this package as i18n source-of-truth; apply miomock i18n changes in `examples/miomock/api`.

## Commands

- Package-local scripts are minimal in this workspace.
- Use root filter commands when needed:
  - `pnpm --filter miomock-web build`
  - `pnpm --filter miomock-web dev`

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (oxlint + oxfmt) must pass before handoff.
