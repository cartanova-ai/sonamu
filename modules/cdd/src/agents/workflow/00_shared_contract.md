# CDD Shared Contract

Every CDD prompt and agent preset must follow this document before any other instruction.

## Document hierarchy

Read order for all CDD participants:

1. `00_shared_contract.md` (this document)
2. `01_cdd.md` (core definitions, artifact chain, business logic rules)
3. The role-specific workflow prompt (e.g., `02_orchestrator.md`, `03_planner.md`)
4. The agent preset file (e.g., `agents/cdd-implementer.md`)

When documents conflict, earlier in this list takes precedence.

## Artifact chain

Every stage consumes upstream artifacts and produces downstream artifacts. No stage may skip or redefine the artifact schema defined in its canonical location.

| Artifact            | Producer                 | Consumer            | Schema location                       |
| ------------------- | ------------------------ | ------------------- | ------------------------------------- |
| `bootstrap_context` | orchestrator (bootstrap) | planner             | `02_orchestrator.md#bootstrap`        |
| `plan_document`     | planner                  | orchestrator + user | `03_planner.md#plan-document`         |
| `claim_blueprint`   | planner                  | orchestrator        | `03_planner.md#claim-blueprint`       |
| `execution_graph`   | planner                  | orchestrator        | `03_planner.md#execution-graph`       |
| `claim` (YAML)      | orchestrator             | worker              | `01_cdd.md#claim-format`              |
| `worker_result`     | worker                   | orchestrator        | `04_worker_contract.md#return-format` |
| `review_result`     | reviewer                 | orchestrator        | `05_reviewer.md#output-format`        |
| `handoff_bundle`    | orchestrator             | user                | `06_handoff.md#bundle-format`         |

## Common constraints

These apply to every CDD participant regardless of role.

- `scope.write` boundary is absolute. A worker must never edit files outside its assigned scope.
- `as any` and `as unknown as T` are strictly prohibited in all TypeScript code.
- Business logic documents (`contract/`) are read-only for all roles except the orchestrator (with user confirmation).
- Generated files (`*.generated.ts`, `sonamu.generated.*`, `queries.generated.ts`) must not be hand-edited.
- Migration files must not be hand-written. Use Sonamu CLI.
- No nested agent spawns. Only the orchestrator spawns workers.

## Common verification

All stages that produce code changes must pass these gates before reporting completion:

Select commands from the consumer project: use `mise run` only when the project has
the current generated `mise.toml` configuration and tasks; otherwise use that project's
configured equivalent task runner and commands. For current generated projects:

- `mise run build` (type check + build)
- `mise run check` (oxlint + oxfmt lint/format at workspace root)

Project-level gates (test, migration validation) are stage-specific and defined in respective workflow prompts.

## Commit policy

- Format: `[scope] type: title`
- Commit messages in Korean.
- No Co-Authored-By trailers.

## Language policy

- Prompts and agent reasoning: English.
- All user-facing output (plans, reports, review findings, handoff): Korean.

## Error handling common behavior

When a worker encounters any of the following, it must stop and report to the orchestrator:

- Changes needed outside `scope.write`.
- Build or check failure after reasonable fix attempt.
- Missing prerequisite (dependency Claim not yet completed).
- Ambiguity in the Claim that cannot be resolved from `scope.read` context.

The worker must not silently work around these issues.

## Execution modes

CDD supports two execution modes, determined at bootstrap:

### Team mode

- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable.
- Workers persist for the entire CDD session via `TeamCreate`.
- Workers may communicate via `SendMessage` for interface/type change notifications.
- Workers must not expand `scope.write` based on peer messages.

### Sub-agent mode

- Workers are spawned on-demand via `Agent` tool.
- Workers cannot communicate with each other.
- All coordination passes through the orchestrator.
