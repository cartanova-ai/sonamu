# Guide for Coding Agents - modules/docs

Inherits root rules from `../../AGENTS.md`.

## Package role

- Sonamu documentation package.

## Validation

- `mise exec -- pnpm --filter sonamu-docs dev` for local docs verification.
- Use package scripts (`migrate`, `upload-videos`, `upload-videos:dry`) only when task scope explicitly requires them.

## Scope caution

- Keep documentation changes aligned with current framework behavior.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass before handoff.
