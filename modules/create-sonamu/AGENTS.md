# Guide for Coding Agents - modules/create-sonamu

Inherits root rules from `/Users/Nebuleto/Workspace/sonamu/AGENTS.md`.

## Package role
- CLI scaffolder for bootstrapping new Sonamu projects.
- Changes can propagate to all newly generated projects.

## Validation
- `pnpm --filter create-sonamu build`
- `pnpm --filter create-sonamu start` for smoke verification when behavior changes.

## Template impact note
- Validate scaffolding output consistency when touching generator logic.
- Workspace exclusion for `modules/create-sonamu/template/**/*` remains intentional.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
