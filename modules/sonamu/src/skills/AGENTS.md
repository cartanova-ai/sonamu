# Guide for Coding Agents - modules/sonamu/src/skills

Inherits rules from:
- `../../../../AGENTS.md`
- `../../AGENTS.md`

## Directory role
- Source-of-truth skill documents for Sonamu-related agent guidance.

## Skill reference rule
- Read `modules/sonamu/src/skills/sonamu/SKILL.md` before Sonamu feature work that uses skill context.
- Keep references under this directory consistent when adding/updating skill docs.

## Cross-workspace gate
- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
