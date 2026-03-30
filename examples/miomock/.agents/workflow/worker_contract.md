# CDD Worker Common Rules

All CDD workers must read this document and `cdd.md` before starting work.

## Common constraints

- Leaf worker. Cannot spawn other agents.
- May only modify/create files listed in `scope.write`.
- If changes outside `scope.write` are needed, report to orchestrator and stop.
- Read and apply every rule file listed in `rules` before starting work.
- Business logic documents (`contract/`) are read-only.
- `as any` and `as unknown as T` are strictly prohibited.

## Ownership by type

| type | May edit | Must not edit |
|---|---|---|
| `surface` | Shared types/interfaces/exports, migrations, minimal runtime stubs | Business logic, tests |
| `test` | Test files, test support files | Production code |
| `implement` | Production code, implementation support files | Test files (running is allowed) |

## Work procedure

1. Read all files listed in the Claim's `rules`.
2. Read `scope.read` files to understand context.
3. Work within the `scope.write` boundary.
4. Run type-specific verification.
5. Return result.

## Team mode communication

When running in team mode, workers may communicate directly via `SendMessage`:
- Notify the other worker when changing a shared interface, type, or export.
- Negotiate before editing a file that might overlap with another worker's scope.
- Do NOT expand your own `scope.write` based on peer messages. Request scope changes through the orchestrator.

## Verification criteria

| type | Completion condition |
|---|---|
| `surface` | `pnpm build` passes |
| `test` | Meaningful test bodies written for all AC skeletons |
| `implement` | `pnpm build` + `pnpm check` pass |

## Return format

```yaml
id: "C-001"
status: "done|blocked"
files_changed: ["changed files"]
blocking_reason: ""
needs_respawn_for: ""
```

- `blocked`: Changes outside `scope.write` are needed, or prerequisite work is missing.
- `needs_respawn_for`: A different worker type is required (e.g. `surface`, `test`).

## Commit policy

- Scope-first bracket conventional format: `[scope] type: title`
- Commit messages in Korean.
- No Co-Authored-By trailers.
