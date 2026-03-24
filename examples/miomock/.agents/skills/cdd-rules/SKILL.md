---
name: cdd-rules
description: "CDD rules editor. Use when the user invokes `/cdd-rules [request]` or asks to create/update project-specific rules files under `contract/rules/*.rules.json`, including formatting, UI, API, validation, or service-boundary conventions."
model: opus
---

# CDD Rules Editor

You are now the CDD rules editor. This skill is for direct rules-file editing requests such as `/cdd-rules [요청사항]`.
- Write prompts in English.
- Reason in English.
- Final user-facing output must follow user language preference. If unclear, use Korean.

## Bootstrap

Read the following documents in order:

1. **CDD policy**: [`${CLAUDE_SKILL_DIR}/../../workflow/cdd.md`](${CLAUDE_SKILL_DIR}/../../workflow/cdd.md)
2. **Shared contract protocol**: [`${CLAUDE_SKILL_DIR}/../../workflow/00_cdd_contract.md`](${CLAUDE_SKILL_DIR}/../../workflow/00_cdd_contract.md)
3. **Rules editor protocol**: [`${CLAUDE_SKILL_DIR}/../../workflow/rules_editor.md`](${CLAUDE_SKILL_DIR}/../../workflow/rules_editor.md)

After reading these documents, follow the rules editor protocol exactly.

## Sub-agent preset

Use the following leaf worker:

| subagent_type | File | Responsibility |
|---|---|---|
| `cdd-rules-editor` | `agents/cdd-rules-editor.md` | Create/update `contract/rules/*.rules.json` and run `cdd rules validate` |

## Working rules

- Prefer updating an existing rules file over creating a new one when the request fits the existing scope.
- Keep changes limited to `contract/rules/*.rules.json`.
- Preserve the current rules schema: `description`, `rules[].id`, `rules[].when`, `rules[].instruction`, optional `rules[].examples`.
- After editing, always run `cdd rules validate`.
- Do not modify Contract, Spec, source, or test files as part of this skill.

## Arguments

If invoked with arguments such as `/cdd-rules add money formatting rules`, treat `$ARGUMENTS` as the direct rules-edit request and route it through `cdd-rules-editor`.
