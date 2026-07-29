# Guide for Coding Agents - modules/sonamu/src/skills

Inherits rules from:

- `../../../../AGENTS.md`
- `../../AGENTS.md`

## Directory role

Source of truth for the Sonamu skills that `sonamu skills sync` installs into user projects.

```
skills/
├── sonamu/                 root skill — routing table + cross-cutting conventions
└── sonamu-<name>/          each directory is one agent skill
    ├── SKILL.md            entry point (target ≤ 12KB, hard limit 20KB)
    └── references/*.md     detail, loaded only when needed (hard limit 20KB)
```

Size limits are enforced by `scripts/check-skill-size.ts`, wired into root `pnpm check`.
They are derived from measured Expo (max 19.1KB) and Vercel (max 17.3KB) skill sizes.

## Skill boundary rule

A document belongs in a skill only if it has a **discrete trigger moment** — a point where an
agent can decide "now I need this". Content that applies to every turn (type-safety policy,
lint gates, universal conventions) is horizontal and belongs in the root `sonamu` skill
instead, because no specific skill will surface it at the right moment.

Split criteria when adding or reorganizing:

1. Documents read together in one task belong in one skill.
2. Each skill's `description` must state its trigger moment, distinctly from every other skill.
3. Prefer small duplication over cross-skill references. Skills load independently, so pointing
   from one skill to another forces both into context.

## Description format

Every `description` is one line in three parts, matching what Expo and Vercel ship:

```
<What it does>. Use when <discrete trigger moments>. Covers <concrete symbols and commands>.
```

- **What** — third-person verb, no "This skill…". "Generates and applies Sonamu database
  migrations."
- **Use when** — the moments an agent can recognise. Name failures too, not just intentions:
  "a migration fails or conflicts" catches cases "modifying a schema" misses. Never restate the
  skill name — "Use when implementing internationalization" tells an agent nothing.
- **Covers** — concrete identifiers an agent is likely to have in context: commands, decorators,
  function names, error strings. This is matching surface, so prefer `executeSubsetQuery` and
  `pg_trgm` over "query helpers".

Keep it under ~400 characters. A well-formed trigger is necessary but not sufficient: Vercel
measured a correctly written description that still went uninvoked in 56% of cases because its
trigger was horizontal ("when writing or reviewing React code" applies to every turn). Write
triggers that name a discrete moment.

`pnpm skills:index` parses this shape — it takes the `Use when` sentence and drops `Covers`.

## Skill index

The root `sonamu` skill carries a generated routing table. It exists because each skill's
`description` only fires at its own trigger moment — work that matches none of them gets no
skill at all, and the root skill's broad description catches that case.

Never hand-edit the region between `<!-- SKILL-INDEX:START -->` and `<!-- SKILL-INDEX:END -->`:

```bash
pnpm skills:index
```

`pnpm check` fails when the index is stale.

Users who want the table always in context can run `sonamu skills index`, which writes it into
their project's `AGENTS.md` inside `<!-- SONAMU:START -->` markers. That edits a file the user
owns, so it is never part of `skills sync` — it only runs when invoked explicitly.

## Contributing a troubleshooting resolution

Only for maintainers of this repository. Skills shipped to user projects describe how to *use*
Sonamu — never how to contribute to it, and never anything specific to one company or client
project.

Suggest capturing a resolution when all of these hold:

1. The session went error → investigation → fix → success.
2. The fix revealed internal framework behavior or an undocumented constraint.
3. The same problem is likely to hit other projects.

Skip typos, missing imports, project-specific business logic bugs, and one-off environment
issues.

Then, before writing anything:

1. Find the skill whose trigger moment matches, and read it. Appending to an existing skill is
   the normal outcome; a new skill is rare and needs a distinct trigger moment of its own.
2. Check that the content is not already covered. Duplicates are the common failure here.
3. Put horizontal rules in the root `sonamu` skill, not in a task skill.
4. Get user confirmation before applying.

Project-specific notes belong in that project's own skill directory
(`.agents/skills/<name>/SKILL.md`), written by hand — never in this directory.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` (oxlint + oxfmt + skill size + skill index) must
  pass before handoff.
