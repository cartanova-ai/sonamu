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

## Skill contribution trigger

- After resolving a troubleshooting issue, suggest the `skill-contribution.md` workflow if the resolution is reusable.
- If the user explicitly requests (e.g. "add this to skills", "record this"), read `skill-contribution.md` and proceed immediately.
- Always check existing skills for duplicates before writing. Do not create new files unconditionally.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (Biome) must pass before handoff.

## TypeScript type safety policy

- `as any` and `as unknown as T` are strictly prohibited.
- Resolve type errors through correct type annotations, generic constraints, type narrowing, or interface extension.
- Do not use `as any` to work around "excessively deep" or similar TypeScript inference limits — find the correct access pattern instead (e.g. use `getPuri("r")` directly rather than casting the result).
- Chaining methods after `as any` bypasses all TypeScript signature checks and leads directly to runtime bugs.
- Non-null assertion (`!`) is prohibited. Use optional chaining (`?.`) or type guard filters instead.

## Code quality gate

After editing any `.ts` or `.tsx` file, always run both checks before considering the task done:

1. `npx tsc --noEmit --skipLibCheck` — type errors
2. `pnpm biome check <file>` — lint and format

Do not skip biome check even when tsc passes. Biome catches `noNonNullAssertion`, import order, and formatting issues that tsc does not.

## Skill read triggers

Read the listed skill file before attempting any workaround or fix in these situations:

| Situation | Read before acting |
|-----------|-------------------|
| TypeScript error in Model code (type inference, "excessively deep", etc.) | `puri.md`, `model.md` |
| Writing or modifying a `findMany()` / `executeSubsetQuery()` call | `model.md` |
| Writing or modifying a `@upload` method | `api.md` |
| Database query returning unexpected results | `puri.md` |
| Migration error or schema change | `migration.md` |
| Spec status gate or testRef validation failing | `cdd.md` |
