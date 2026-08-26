# Repository Instructions

Before performing a task, read and follow `.agents/agents/orchestrator.md`.

## Instruction Scope

- This file applies to the entire repository.
- A deeper `AGENTS.md` takes precedence within its directory.
- Before changing a file, read the nearest applicable `AGENTS.md`.

## Repository Map

- `modules/sonamu`: Sonamu framework core.
- `examples/miomock`: Sample application and integration-validation target.
- `examples/miomock/api`: Source of truth for miomock i18n.
- `modules/create-sonamu`: Project generator and templates.
- `modules/docs`: Sonamu documentation.
- `modules/react-components` and `modules/react-sui`: Shared React packages.
- `modules/hmr-*` and `modules/ts-loader`: Development runtime and tooling.
- `modules/tasks`: Distributed task queue.

## Toolchain

- Run `mise install --locked` for explicit toolchain setup.
- Use `mise run <task>` for repository-wide tasks.
- Use `mise exec -- pnpm ...`, `mise exec -- node ...`, and equivalent
  wrappers for package-local or raw tool commands. Do not invoke host
  `node`, `npm`, `npx`, or `pnpm` directly.
- The root `mise.toml` resolves from repository subdirectories.
- Docker, EAS, and container build files are explicit exceptions where mise
  is intentionally absent.

## Validation

- Run `mise run check` at the repository root for every code change.
- Run applicable tests and builds for each affected package.
- For framework-core, generator, template, or generated-output changes, validate
  the resulting behavior in `examples/miomock`.

## Language

- Write prompts and reasoning instructions passed from the orchestrator to
  sub-agents in English.
- Write code comments and test case descriptions in Korean.

## Comments

- When code contains business logic, add concise inline comments that explain
  its intent or rationale.
- Do not narrate behavior already evident from the code.
- When a method needs detailed documentation, use JSDoc instead of long inline
  or block comments.

## Frontend

- For React code changes, read and follow the
  `vercel-react-best-practices` skill.
- For user-visible UI behavior changes, verify the affected flow with
  Playwright MCP when the application can be run locally.

## Sonamu Guidance

Sonamu framework guidance is provided by externally installed `sonamu-*`
skills. Read the applicable installed skill before changing framework
behavior.
