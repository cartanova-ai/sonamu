# CDD Role Map

Dispatch reference for all CDD roles. Used by the orchestrator to select execution mode and by inline-fallback environments to construct worker prompts.

## Execution modes

| Mode | When | How workers are loaded |
|---|---|---|
| `preset` | Claude Code with `.agents/agents/*.md` support | Agent presets loaded directly |
| `inline_fallback` | Other environments without preset support | Role map + canonical prompt file contents inlined into spawn payload |

## Role definitions

### `cdd-planner`

| Field | Value |
|---|---|
| Purpose | Planning artifact production |
| Preset | `agents/cdd-planner.md` |
| Canonical prompt | `workflow/03_planner.md` |
| Spawnable | Yes (leaf worker) |
| Tools | Read, Grep, Glob, Bash (read-only) |
| Upstream | `bootstrap_context` |
| Downstream | `plan_document`, `claim_blueprint`, `execution_graph` |

### `cdd-surface-scaffolder`

| Field | Value |
|---|---|
| Purpose | Downstream prerequisites (types, migrations, scaffolds) |
| Preset | `agents/cdd-surface-scaffolder.md` |
| Canonical prompt | `workflow/04_worker_contract.md` |
| Spawnable | Yes (leaf worker) |
| Tools | Read, Grep, Glob, Bash, Edit, Write |
| Upstream | Claim YAML (`type: surface`) |
| Downstream | `worker_result` |

### `cdd-test-writer`

| Field | Value |
|---|---|
| Purpose | Acceptance test implementation |
| Preset | `agents/cdd-test-writer.md` |
| Canonical prompt | `workflow/04_worker_contract.md` |
| Spawnable | Yes (leaf worker) |
| Tools | Read, Grep, Glob, Bash, Edit, Write |
| Upstream | Claim YAML (`type: test`) |
| Downstream | `worker_result` |

### `cdd-implementer`

| Field | Value |
|---|---|
| Purpose | Production code implementation |
| Preset | `agents/cdd-implementer.md` |
| Canonical prompt | `workflow/04_worker_contract.md` |
| Spawnable | Yes (leaf worker) |
| Tools | Read, Grep, Glob, Bash, Edit, Write |
| Upstream | Claim YAML (`type: implement`) |
| Downstream | `worker_result` |

### `cdd-reviewer`

| Field | Value |
|---|---|
| Purpose | Stage-level and integration code review |
| Preset | `agents/cdd-reviewer.md` |
| Canonical prompt | `workflow/05_reviewer.md` |
| Spawnable | Yes (leaf worker) |
| Tools | Read, Grep, Glob, Bash (read-only) |
| Upstream | Review assignment (changed files, rules, evidence, claim) |
| Downstream | `review_result` |

### `cdd-orchestrator`

| Field | Value |
|---|---|
| Purpose | Control plane (bootstrap, dispatch, review loops, handoff) |
| Preset | `agents/cdd-orchestrator.md` |
| Canonical prompt | `workflow/02_orchestrator.md` |
| Spawnable | **No** (main agent assumes this role) |
| Tools | All |
| Upstream | User request |
| Downstream | `bootstrap_context`, Claim YAMLs, `handoff_bundle` |

## Inline fallback spawn payload

When `preset` mode is unavailable, the orchestrator constructs spawn payloads with:

```yaml
spawn_payload:
  role_id: "cdd-implementer"
  role_file_ref: "workflow/roles/00_role_map.md#cdd-implementer"
  prompt_file_ref: "workflow/04_worker_contract.md"
  shared_contract_ref: "workflow/00_shared_contract.md"
  core_definitions_ref: "workflow/01_cdd.md"
  claim: { ... }  # full Claim YAML
  execution_mode: "inline_fallback"
```

The spawned agent must read `shared_contract_ref` and `core_definitions_ref` first, then `prompt_file_ref`, then process the `claim`.
