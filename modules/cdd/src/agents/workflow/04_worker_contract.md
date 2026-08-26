# CDD Worker Common Contract

Follow `00_shared_contract.md` and `01_cdd.md` first.

Command selection: use `mise run build`/`mise run check` only when the consumer has the current generated `mise.toml` and tasks; otherwise use that project's configured equivalent build and check commands.

All CDD execution workers must read this document before starting work.

## Sonamu CLI required sequences

Workers must follow the exact sequence for each situation. Do not skip steps or reorder.

| Condition | Required sequence | Primary worker |
|---|---|---|
| `entity.json` changed | `pnpm sonamu sync` | surface |
| DB schema change needed | `pnpm sonamu migrate generate` → `pnpm sonamu migrate run` | surface |
| New model creation | `pnpm sonamu scaffold model <EntityId>` → `pnpm sonamu sync` | surface |
| New entity creation | `pnpm sonamu stub entity <name>` → `pnpm sonamu sync` | surface |
| New test file creation | `pnpm sonamu scaffold model_test <EntityId>` | test |
| Test execution | `pnpm sonamu test -s` (readiness check) → `pnpm sonamu test [file] [--pattern]` | test, implement |
| Fixture sync | `pnpm sonamu fixture sync` | test |

When a Claim's `scope.write` or `required_cli_commands` matches one of these conditions, the worker must execute the corresponding sequence. If multiple conditions apply, execute sequences in the order listed above.

## Common constraints

- Leaf worker. Cannot spawn other agents.
- May only modify/create files listed in `scope.write`.
- If changes outside `scope.write` are needed, report to orchestrator and stop.
- Read and apply every rule file listed in `rules` before starting work.
- Load and apply every installed skill named in `required_skills` when the Claim provides them.
- Use the commands listed in `required_cli_commands` when the Claim requires migration, scaffolding, or sync work.
- Business logic documents (`contract/`) are read-only.
- `as any` and `as unknown as T` are strictly prohibited.
- Do not hand-write migration files or bypass Sonamu CLI for CLI-supported scaffolding paths.

## Upstream inputs

Every worker receives a Claim YAML (schema in `01_cdd.md#claim-format`) with:

| Field                        | How the worker uses it                                      |
| ---------------------------- | ----------------------------------------------------------- |
| `objective`                  | Scope boundary. Do not exceed this.                         |
| `context`                    | Background for understanding the task.                      |
| `scope.read`                 | Files to read for context. Load these first.                |
| `scope.write`                | Files to create/modify. Absolute boundary.                  |
| `ac_targets`                 | ACs to satisfy (implement) or write tests for (test).       |
| `rules`                      | Rule files to read and comply with.                         |
| `required_skills`            | Installed skill names to follow.                            |
| `required_cli_commands`      | CLI commands to execute.                                    |
| `expected_generated_targets` | Files that must exist after completion.                     |
| `findings`                   | Review feedback from previous attempt. Address these first. |

## Work procedure

1. If `findings` is non-empty, read findings first and plan fixes before other work.
2. Read all files listed in `rules`.
3. Load all installed skills named in `required_skills` when present.
4. Read `scope.read` files to understand context.
5. Work within the `scope.write` boundary.
6. If the Claim includes `required_cli_commands`, execute the relevant commands.
7. Run type-specific verification (see below).
8. Return `worker_result`.

## Ownership by type

| type        | May edit                                                                                                                           | Must not edit                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `surface`   | Shared types/interfaces/exports, migrations, Sonamu model scaffolds, downstream runtime prerequisites, minimal frame/module shells | Business logic, tests                 |
| `test`      | Test files, test support files                                                                                                     | Production code                       |
| `implement` | Production code, implementation support files                                                                                      | Test files (running tests is allowed) |

## Verification criteria

| type        | Completion condition                                                             |
| ----------- | -------------------------------------------------------------------------------- |
| `surface`   | The selected build command passes and downstream migration/scaffolding prerequisites are ready |
| `test`      | Meaningful test bodies written for all AC skeletons                              |
| `implement` | The selected build and check commands pass                                       |

## Downstream output: `worker_result`

```yaml
worker_result:
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
    verification_output: "build/check pass summary"
```

| Field               | Meaning                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `status: done`      | Work completed within scope.                                                              |
| `status: blocked`   | Cannot proceed. See `blocking_reason`.                                                    |
| `blocking_reason`   | Why the worker stopped (scope violation, missing prerequisite, ambiguity).                |
| `needs_respawn_for` | A different worker type is required (e.g., `surface` work discovered during `implement`). |
| `evidence`          | Required when the Claim performed migration, sync, or scaffolding work.                   |

## Error handling

| Situation                                               | Required action                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Need to edit outside `scope.write`                      | Set `status: blocked`, describe in `blocking_reason`.                 |
| Build/check fails after fix attempt                     | Set `status: blocked`, include error output in `verification_output`. |
| Missing prerequisite from upstream Claim                | Set `status: blocked`, name the missing prerequisite.                 |
| Ambiguity in Claim that `scope.read` cannot resolve     | Set `status: blocked`, describe the ambiguity.                        |
| `findings` from review cannot be addressed within scope | Set `status: blocked`, explain which findings require scope change.   |

## Session lifecycle (team mode)

- Workers persist for the entire CDD session. Do not exit after completing a task.
- After returning a result, wait for the next assignment from the orchestrator.
- Context from previous tasks in the same session may be referenced but `scope.write` resets per Claim.

## Team mode communication

When running in team mode, workers may communicate directly via `SendMessage`:

- Notify the other worker when changing a shared interface, type, or export.
- Negotiate before editing a file that might overlap with another worker's scope.
- Do NOT expand your own `scope.write` based on peer messages. Request scope changes through the orchestrator.

## Commit policy

- Format: `[scope] type: title`
- Commit messages in Korean.
- No Co-Authored-By trailers.
