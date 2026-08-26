# Guide for Coding Agents - modules/create-sonamu

Inherits root rules from `../../AGENTS.md`.

## Module role

- `modules/create-sonamu` is the project generator
  (`mise exec -- pnpm create sonamu`).
- `index.ts` drives the prompts, copies `template/`, and writes the generated
  `package.json` and `pnpm-workspace.yaml`.
- `template/` is the source of every generated project. Anything wrong here
  ships to every new project.

## Dependency versions in generated projects

The template declares `"sonamu": "workspace:^"`, and `scripts/prepublish.mjs` substitutes the
current versions before an npm publish (`postpublish.mjs` restores the originals). The published
tarball therefore ships resolvable versions — running the generator from this monorepo is the
only path that leaves `workspace:^` in place.

Those substituted versions freeze at create-sonamu's publish time, and a caret on a `0.x`
version does not cross a minor. create-sonamu@0.2.6 pins `^0.9.12` while sonamu is at 0.10.5, so
new projects start a minor behind until create-sonamu is republished.

## Validation requirements

- For template changes, generate a project and verify it installs and builds.
- Template files are excluded from oxfmt (see root `.oxfmtrc.json`), so match
  the surrounding style by hand.

## Cross-workspace gate

- For changes in this scope, root `mise run check` must pass before handoff.
