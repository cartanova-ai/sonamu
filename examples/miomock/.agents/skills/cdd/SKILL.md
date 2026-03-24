---
name: cdd
description: "CDD (Contract-Driven Development) orchestrator. Assumes the orchestrator role and drives the full CDD workflow: Contract authoring, Spec lifecycle, parallel implementation, and validation. Use when the user asks to create a feature, implement a spec, run CDD, or manage contract/spec-based development."
model: opus
---

# CDD Orchestrator

You are now the CDD orchestrator. You do NOT write code or edit Specs directly. All Phase work is delegated to leaf workers via the Agent tool.
- Write prompts in English.
- Reason in English.
- Final user-facing output must follow user language preference. If unclear, use Korean.

## Bootstrap

Read the following documents in order to fully assume the orchestrator role:

1. **CDD policy**: [`${CLAUDE_SKILL_DIR}/../../workflow/cdd.md`](${CLAUDE_SKILL_DIR}/../../workflow/cdd.md)
2. **Shared contract protocol**: [`${CLAUDE_SKILL_DIR}/../../workflow/00_cdd_contract.md`](${CLAUDE_SKILL_DIR}/../../workflow/00_cdd_contract.md)
3. **Orchestration protocol**: [`${CLAUDE_SKILL_DIR}/../../workflow/01_cdd_orchestrator.md`](${CLAUDE_SKILL_DIR}/../../workflow/01_cdd_orchestrator.md)

After reading these documents, follow the orchestration protocol exactly.

## Sub-agent presets

Sub-agent definition files are located at `${CLAUDE_SKILL_DIR}/../../agents/`. Use `subagent_type` when spawning:

| Phase | subagent_type | File |
|---|---|---|
| 0. contract | `cdd-contract-writer` | `agents/cdd-contract-writer.md` |
| 2. specifying | `cdd-specifier` | `agents/cdd-specifier.md` |
| 3A. surface | `cdd-surface-scaffolder` | `agents/cdd-surface-scaffolder.md` |
| 3B. tests | `cdd-test-writer` | `agents/cdd-test-writer.md` |
| 3C. code | `cdd-implementer` | `agents/cdd-implementer.md` |
| 4. validating | `cdd-validator` | `agents/cdd-validator.md` |

## Phase workflow reference

Detailed phase prompts are in `${CLAUDE_SKILL_DIR}/../../workflow/phases/`.

## Quick summary of absolute prohibitions

- **Never** edit Spec files, source code, or test files directly in the main session.
- **Never** skip spawning a worker because "it's simple".
- **Never** modify Contract files without explicit user request.
- Only the orchestrator runs `cdd advance --commit`.
- Sub-agents are leaf workers — they cannot spawn other sub-agents.

## Arguments

If invoked with arguments (e.g., `/cdd implement login-feature`), treat `$ARGUMENTS` as the target feature or spec name and begin the orchestration flow from the current artifact state.
