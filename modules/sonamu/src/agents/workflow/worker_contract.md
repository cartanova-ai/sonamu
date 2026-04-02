# CDD Worker Common Rules

All CDD execution workers must read this document and `cdd.md` before starting work.

## Common constraints

- Leaf worker. Cannot spawn other agents.
- May only modify/create files listed in `scope.write`.
- If changes outside `scope.write` are needed, report to orchestrator and stop.
- Read and apply every rule file listed in `rules` before starting work.
- Read and apply every file listed in `required_skills` when the Claim provides them.
- Use the commands listed in `required_cli_commands` when the Claim requires migration, scaffolding, or sync work.
- Business logic documents (`contract/`) are read-only.
- `as any` and `as unknown as T` are strictly prohibited.
- Do not hand-write migration files or bypass Sonamu CLI for CLI-supported scaffolding paths.

## Session lifecycle

- In team mode, workers persist for the entire CDD session. Do not exit after completing a task.
- After returning a result, wait for the next assignment from the orchestrator.
- Context from previous tasks in the same session may be referenced but `scope.write` resets per Claim.

## Ownership by type

| type | May edit | Must not edit |
|---|---|---|
| `surface` | Shared types/interfaces/exports, migrations, Sonamu model scaffolds, downstream runtime prerequisites, minimal frame/module shells | Business logic, tests |
| `test` | Test files, test support files | Production code |
| `implement` | Production code, implementation support files | Test files (running is allowed) |

## Work procedure

1. Read all files listed in the Claim's `rules`.
2. Read all files listed in the Claim's `required_skills` when present.
3. Read `scope.read` files to understand context.
4. Work within the `scope.write` boundary.
5. If the Claim includes `required_cli_commands`, execute the relevant commands and record them in the return payload.
6. Run type-specific verification.
7. Return result.

## Team mode communication

When running in team mode, workers may communicate directly via `SendMessage`:
- Notify the other worker when changing a shared interface, type, or export.
- Negotiate before editing a file that might overlap with another worker's scope.
- Do NOT expand your own `scope.write` based on peer messages. Request scope changes through the orchestrator.

## Verification criteria

| type | Completion condition |
|---|---|
| `surface` | `pnpm build` passes and downstream migration/scaffolding prerequisites are ready |
| `test` | Meaningful test bodies written for all AC skeletons |
| `implement` | `pnpm build` + `pnpm check` pass |

## Return format

```yaml
id: "C-001"
status: "done|blocked"
files_changed: ["changed files"]
blocking_reason: ""
needs_respawn_for: ""
evidence:
  executed_cli_commands: ["pnpm sonamu sync"]
  generated_targets: ["src/application/user/user.model.ts"]
  migration_status: "not_needed|generated|run|blocked"
  scaffolding_status: "not_needed|generated|updated|blocked"
  downstream_ready: true
```

- `blocked`: Changes outside `scope.write` are needed, or prerequisite work is missing.
- `needs_respawn_for`: A different worker type is required (e.g. `surface`, `test`).
- `evidence`: Required when the Claim performed migration, sync, or scaffolding work.

## Commit policy

- Scope-first bracket conventional format: `[scope] type: title`
- Commit messages in Korean.
- No Co-Authored-By trailers.
