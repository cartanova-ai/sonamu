# Guide for Coding Agents - modules/cli

Inherits root rules from `../../AGENTS.md`.

## Module role

- `modules/cli` is the `@sonamu-kit/cli` package, the user-facing Sonamu CLI.
- The CLI grammar lives in `src/program.ts`; command dispatch and lifecycle
  live in `src/runtime.ts`; presentation lives in `src/output.ts`.
- Command behavior is implemented in `sonamu` (`src/tooling/*`), not here.
  A parser branch and its tooling handler form one contract; change both
  together.

## Optique skill

- Before changing parsers, options, subcommands, completion, or help output,
  read the official Optique agent skill at
  `node_modules/@optique/core/skills/optique/SKILL.md`.
  It is bundled with the installed `@optique/core` package, so it always
  matches the pinned catalog version.
- Follow its rules rather than hand-rolling argument handling: compose with
  `object()`/`or()`/`command()`, express optionality with `optional()` or
  `withDefault()`, and validate values with value parsers instead of
  post-parse checks.

## High-impact areas

- `src/program.ts`
  - Every accepted option must be satisfiable by its tooling handler.
    Optional in the grammar must not be required in the handler.
  - Value-parser bounds (`integer({ min })`, `choice([...])`) must match the
    tooling-side schema exactly.
- `src/runtime.ts`
  - Destructive-operation guards and production confirmation paths.
  - Lifecycle ordering: candidate providers must not touch framework state
    before Sonamu is initialized.
- `src/handlers.ts`
  - Any package resolved at runtime must be declared in `package.json`
    dependencies; a peer package transitive dependency is not resolvable here.
- `bin/sonamu.js`
  - Validate CLI entry behavior after build.

## Validation requirements

- Minimum package checks:
  - `mise exec -- pnpm --filter @sonamu-kit/cli check`
  - `mise exec -- pnpm --filter @sonamu-kit/cli test`
- When a command behavior changes, verify the flow in `examples/miomock`.
- When a command is added, renamed, or removed, update `modules/docs`
  (ko and en) and the `modules/create-sonamu` READMEs in the same change.

## Cross-workspace gate

- For changes in this scope, root `mise run check` (oxlint + oxfmt) must pass
  before handoff.
