# Guide for Coding Agents - modules/sonamu/src/skills

Inherits rules from:

- `../../../../AGENTS.md`
- `../../AGENTS.md`

## Directory role

- Source-of-truth skill documents for Sonamu-related agent guidance.

## Skill reference rule

- Read `modules/sonamu/src/skills/sonamu/SKILL.md` before Sonamu feature work that uses skill context.
- Keep references under this directory consistent when adding/updating skill docs.

## Skill reference rule (user projects)

When working in a user Sonamu project, always read skill files directly using the Read tool:

```
.claude/skills/sonamu/{skill-name}.md
```

Examples:

- Migration → Read `.claude/skills/sonamu/migration.md`
- Entity creation → Read `.claude/skills/sonamu/entity-basic.md`
- Full workflow → Read `.claude/skills/sonamu/workflow.md`
- Scaffolding → Read `.claude/skills/sonamu/scaffolding.md`

See `.claude/skills/sonamu/SKILL.md` for the full skill list.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.
