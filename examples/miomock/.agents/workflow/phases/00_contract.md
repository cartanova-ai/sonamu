# Phase 0: Contract Authoring

Create and fill a Contract document based on the user's feature requirements.

## Required reading (mandatory)

- `../cdd.md`
- `../00_cdd_contract.md`

## Input

```yaml
execution_mode: preset|inline_fallback
role_id: cdd-contract-writer
objective_packet:
  global_objective: "..."
  phase_objective: "Create or refine the Contract"
  unit_objective: "Own only Contract authoring"
  user_review: false
feature_description: "{user's feature description}"
domain: "{domain directory, optional}"
schema: "{schema ID, default: default-contract}"
contract_name: "{contract filename, default: main}"
```

`objective_packet.user_review` is included for contract-phase consistency, but Contract authoring already requires direct user confirmation before completion.

## Procedure

### Step 1: Create contract scaffold

If `contract_name` is not specified, omit it to default to `main`:
```bash
cdd contract create --domain {domain} --schema {schema}
```
This creates `main.contract.json` in the target domain directory.

If the domain already has `main.contract.json`, specify a distinct name:
```bash
cdd contract create {contract_name} --domain {domain} --schema {schema}
```

If the contract file already exists, read it instead of creating a new one.

### Step 2: Read schema

Read the schema file referenced by the contract's `schema` field.
For each field in the schema's `fields` array, note its `name`, `type`, and `description`.

### Step 3: Define features

Based on the user's feature description, identify distinct features and add them to the `features` field as key-value pairs:
- Key: feature identifier (used as Spec filename, kebab-case)
- Value: one-line Korean description of the feature

### Step 4: Fill schema fields

For each schema field:
1. Read the field's `description` to understand what content it should contain.
   - If `description` is empty, infer from the field `name`.
2. Fill the field according to its `type`:
   - `string[]`: ordered list items
   - `Record<string, string>`: key-value pairs
   - `Record<string, object>`: structured entries
3. Content must be written in Korean.
4. Content must stay within the scope of the user's feature description.

### Step 5: Resolve ambiguity

If any of the following are unclear, ask the user before proceeding:
- Feature boundaries (what constitutes a single feature vs. multiple features)
- Domain terminology that needs definition
- Business rules that are implied but not explicitly stated
- Edge cases that may or may not be in scope

### Step 6: Review impacted Specs

When the user explicitly requested a Contract change, inspect related Spec impact before handoff:
1. Find Spec files whose `contracts` array references the current `contract_path`.
2. Read each impacted Spec and identify whether follow-up Spec edits are needed.
3. Record the result as `impacted_spec_followups`.
4. Do not edit the impacted Specs in this phase.

### Step 7: User review

Present the completed Contract to the user for review.
If the user requests changes, apply them and re-present.
The Contract is complete when the user confirms.

## Output

```yaml
contract_path: "{created/updated contract file path}"
features_defined: ["{list of feature keys}"]
schema_fields_filled: ["{list of filled schema fields}"]
impacted_spec_followups:
  - spec_path: "{impacted spec path}"
    reason: "{why follow-up is needed}"
    preferred_respawn_role: "cdd-specifier"
questions_asked: ["{list of clarification questions, if any}"]
```

## Prohibitions

- Do not create or modify Spec files.
- Do not write code.
- Do not make assumptions about ambiguous requirements. Ask the user.
- Do not execute `cdd advance --commit`.
