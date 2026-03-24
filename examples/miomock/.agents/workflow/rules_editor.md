# Utility: Rules Editor

Create or update `contract/rules/*.rules.json` when the user directly requests rules-file editing.

## Required reading (mandatory)

- `./cdd.md`
- `./00_cdd_contract.md`

## Input

```yaml
execution_mode: preset|inline_fallback
role_id: cdd-rules-editor
objective_packet:
  global_objective: "..."
  phase_objective: "Create or update project-specific rules files"
  unit_objective: "Own only rules-file authoring and validation"
  user_review: true|false
rules_request: "{user's rule-edit request}"
target_rules_path: "{absolute target rules file path}"
related_rules_paths: ["{other rules file paths to inspect for consistency}"]
findings: [] # previous review or respawn findings
```

## Procedure

### Step 1: Review the current rules context

1. Read `target_rules_path` if it already exists.
2. Read each file in `related_rules_paths` to avoid duplicate or contradictory rules.
3. Infer the existing language, naming, and example style from the current rules files.
4. If the request is better satisfied by updating an existing file than by creating a new one, prefer the update path.

### Step 2: Plan the requested rule changes

1. Convert the user's request into concrete rule entries.
2. Every rule entry must include:
   - `id`
   - `when`
   - `instruction`
3. Add `examples` only when they make the rule materially clearer.
4. Preserve unrelated existing rules unless the user explicitly requested replacement or deletion.
5. Keep rule IDs stable and unique inside the edited file.

### Step 3: Edit the rules file

1. Create the target file if it does not exist.
2. Keep the JSON valid and aligned with the current rules schema.
3. Write human-readable rule text in the prevailing local style of the target file.
4. Prefer concrete development rules over abstract policy slogans.

### Step 4: Apply respawn findings

If `findings` are provided:
1. Fix the specific rules or file-structure issues they identify.
2. Do not silently reshape unrelated rules.

### Step 5: Validate the result

Run:

```bash
cdd rules validate
```

1. If validation fails, fix the rules file and re-run the command.
2. If the request cannot fit the current rules schema, stop and return `blocking_reason` instead of inventing a new schema silently.

### Step 6: Prepare handoff

Return `ready_for_handoff: true` only when:
- the target rules file reflects the user's request
- the file matches the current rules schema
- `cdd rules validate` passes

## Output

```yaml
target_rules_path: "{edited rules file path}"
files_changed: ["{changed files}"]
rules_reviewed: ["{rule ids reviewed while editing}"]
rules_created: ["{new rule ids}"]
rules_updated: ["{updated rule ids}"]
rules_removed: ["{removed rule ids}"]
validation:
  command: "cdd rules validate"
  status: "pass|fail"
ready_for_handoff: true|false
preferred_respawn_role: "cdd-rules-editor"
user_review_summary: "{brief Korean summary for handoff}"
blocking_reason: "{empty when ready}"
questions_for_user: ["{clarification questions, if any}"]
```

## Prohibitions

- Do not modify Contract files.
- Do not modify Spec files.
- Do not modify source or test files.
- Do not skip `cdd rules validate` after editing.
- Do not invent new top-level schema fields unless the user explicitly requested a rules-schema change.
