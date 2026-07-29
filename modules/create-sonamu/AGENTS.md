# Guide for Coding Agents - modules/create-sonamu

Inherits root rules from `../../AGENTS.md`.

## Module role

- `modules/create-sonamu` is the project generator (`pnpm create sonamu`).
- `index.ts` drives the prompts, copies `template/`, and writes the generated
  `package.json` and `pnpm-workspace.yaml`.
- `template/` is the source of every generated project. Anything wrong here
  ships to every new project.

## Known issue

`index.ts` copies `template/src/packages/api/package.json` changing only `name`,
so a generated project keeps `"sonamu": "workspace:^"` while its generated
`pnpm-workspace.yaml` lists only `packages/api` and `packages/web`. Outside the
Sonamu monorepo that dependency cannot resolve and the user must set up a link
by hand. Fixing the generated dependency is the real remedy; the manual steps
are documented in the `sonamu-init` skill as a stopgap.

## Validation requirements

- For template changes, generate a project and verify it installs and builds.
- Template files are excluded from oxfmt (see root `.oxfmtrc.json`), so match
  the surrounding style by hand.

## Cross-workspace gate

- For changes in this scope, root `pnpm check` must pass before handoff.
