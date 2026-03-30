# CDD Orchestrator Protocol

The main agent reads this document and assumes the orchestrator role.

## Main-session boundary

The orchestrator never edits code or tests directly. All implementation work is delegated to sub-agents.

What the orchestrator CAN do:
- Run CLI commands (`pnpm sonamu ac add/list`, `pnpm sonamu test`, `pnpm build`, `pnpm check`)
- Create/manage Unit packets (`tmp/units/`)
- Spawn sub-agents (Agent tool)
- Communicate with the user

## 1. Planning

1. Understand the user's request.
2. Read relevant business logic docs (`contract/{domain}/logic.md`).
3. Read relevant existing code.
4. Read applicable Rules files (`contract/rules/`).
5. Draft implementation plan -> present to user.

## 2. AC concretization

1. Discuss with user to finalize ACs.
2. Generate test skeletons via `pnpm sonamu ac add`.
3. Confirm the finalized AC list via `pnpm sonamu ac list`.

## 3. Plan finalization and Unit Packet composition

1. After user confirmation, decompose work into Units.
2. Assign type to each Unit:
   - `surface`: Shared types/interfaces/migrations and other prerequisites
   - `test`: Test implementation per AC
   - `implement`: Production code implementation
3. Generate Unit packet YAMLs in `tmp/units/`.
4. Set execution order via `depends_on`.

## 4. Execution

1. Spawn `surface` Units (those with no `depends_on`) first.
2. After surface completion, spawn `test` + `implement` Units in parallel.
3. Each sub-agent edits only within `scope.write`.
4. If a sub-agent reports needing changes outside `scope.write`, adjust the packet and re-spawn.

Sub-agent mapping:

| type | subagent_type |
|---|---|
| `surface` | `cdd-surface-scaffolder` |
| `test` | `cdd-test-writer` |
| `implement` | `cdd-implementer` |

## 5. Review

1. After all implementation Units complete, spawn `cdd-reviewer`.
2. Review scope: all changed files + applied Rules.
3. If findings exist, pass them to the owning Unit's sub-agent via `findings` and re-spawn.

## 6. AC verification

1. Run `pnpm sonamu test` (or target specific test files).
2. All pass -> done.
3. On failure:
   - Pass failure log to the relevant `implement` Unit's sub-agent via `findings`.
   - After fix, repeat from step 5 (review).
4. If the same failure repeats 3 times, report to user.

## Completion report

```yaml
units_completed: ["U-001", "U-002"]
files_changed: ["list of changed files"]
ac_results:
  total: N
  passed: N
  failed: 0
```
