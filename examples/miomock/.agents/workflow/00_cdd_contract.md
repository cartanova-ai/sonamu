# CDD Shared Contract

Common policies applied to all prompts in the CDD workflow.

## Authority order

Contract > Spec > Code. Higher authority takes precedence on conflict.

## CDD policy source

All sub-agents must read the following document before starting work:
- `../../api/contract/cdd.md`

## Role separation

| Role | Responsibility | Description |
|---|---|---|
| LLM | Execution | Perform single actions (write code, write specs, run validation) |
| CLI | Judgment | Gate verification + next action decision (gate checks, state transitions) |
| Spec document | Memory | State + specification + history + plan |

## Sub-agent common rules

- Leaf workers cannot spawn other sub-agents.
- Do not work beyond the assigned phase scope.
- Return results in structured format after completion.
- Contract files are read-only. Report to orchestrator if modification is needed.
- Do not execute `cdd advance --commit`. The orchestrator manages transitions.

## CLI execution context

- Working directory: `examples/miomock/api`
- CDD CLI is executed via the `cdd` command.
- Check current status with `cdd status`.
- Run tests: check readiness with `pnpm sonamu test -s`, then `pnpm sonamu test` or `pnpm test`.

## Language policy

- All Contract and Spec content (summary, description, AC conditions, schema field values) must be written in Korean.
- Code, file paths, and identifiers remain in English.

## Commit policy

- Scope-first bracket conventional format: `[scope] type: title`
- Separate Spec changes and code changes into distinct commits when possible.
- Do not add Co-Authored-By trailers.

## TypeScript policy

- `as any` and `as unknown as T` are strictly prohibited.
- Resolve type errors through proper type annotations, generics, and type narrowing.

## Validation baseline

- `pnpm check` (Biome): workspace root + affected subprojects
- Build: `pnpm build`
- Tests: `pnpm sonamu test` or `pnpm test`
