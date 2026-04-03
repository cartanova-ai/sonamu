---
name: sonamu-cdd
description: CDD artifact technical reference. contract.md format, rules.json format, AC patterns, CDD CLI commands. Read when you need to write CDD artifacts or use the CLI during CDD work.
---

# CDD Artifact Technical Reference

---

## Business Logic (`*.contract.md`)

Documents domain rules and decision rationale in a cohesive form. Located at `contract/**/*.contract.md`.

**Include:**
- Domain rules and constraints ("Refunds are only allowed within 7 days of payment")
- Decision rationale ("Due to PG provider policy")
- Cross-module domain workflows ("Order status: pending → confirmed → shipped → completed")
- Priority/ordering rules ("Discounts: membership tier > coupon > promotion")
- Domain term definitions and role distinctions
- Edge cases and intended handling

**Exclude:**
- Implementation details (file paths, function names, class structure)
- API endpoints or data schemas
- UI layouts or component structure
- Code conventions (those go in `*.rules.json`)

```markdown
# {Domain} Business Logic

## Rules

- Refunds are only allowed within 7 days of payment [Rationale: PG provider policy]
- Order status transitions: pending → confirmed → shipped → completed
- Discount application order: membership tier > coupon > promotion

## Workflow

1. ...
2. ...
```

---

## Rules Files (`contract/rules/`)

### `*.rules.json`

Records code conventions and UI/API rules.

```json
{
  "description": "Scope and purpose of this rule-set",
  "rules": [
    {
      "id": "readonly-money-display-uses-numf",
      "when": "Displaying a monetary value as read-only text or a table cell",
      "instruction": "Apply numF().",
      "examples": ["numF(row.totalAmount)", "numF(summary.budget)"]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `description` | Scope and intent of the rule-set |
| `rules[].id` | Stable identifier |
| `rules[].when` | Condition under which the rule applies |
| `rules[].instruction` | Specific directive to follow |
| `rules[].examples` | Optional code/usage examples |

### `*.known-issues.json`

Records known bugs, framework constraints, and temporary workarounds. Include in a Claim's `rules` field so sub-agents don't repeat the same mistakes.

```json
{
  "description": "Known issues and workarounds",
  "issues": [
    {
      "id": "upload-multipart-form-required",
      "symptom": "Calling an @upload method with Content-Type: application/json causes the file to be missing",
      "workaround": "Must send as multipart/form-data. See the @upload pattern in api.md"
    }
  ]
}
```

---

## AC = Test Names

ACs are not managed as separate documents. The describe/test names in test files are the ACs themselves.

**AC writing principles:**
- **Small and specific**: one AC = one behavior/outcome
- **Include input and expected result in the name**: `"Returns 409 when email is duplicate"` > `"Returns an error"`

```typescript
describe('sign up', () => {
  test('returns 409 when email is duplicate', () => { /* TODO */ });
  test('returns 400 when password is shorter than 8 characters', () => { /* TODO */ });
  test('returns the created user_id on success', () => { /* TODO */ });
});
```

---

## CDD CLI (`@sonamu-kit/cdd`)

```bash
pnpm cdd <command>
```

| Command | Description |
|---------|-------------|
| `cdd ac add <file> <test-name>` | Add an empty test skeleton to a test file. Use `--describe <group>` to specify a describe block |
| `cdd ac list [file]` | Print the describe/test tree of a test file. Parses `test()`, `it()`, and `testAs()` patterns |
| `cdd rules validate` | Validate the format of `contract/rules/*.rules.json` |
| `cdd agents init [--force]` | Initialize CDD agent setup in the project (creates `.agents/`, `AGENTS.md`, and symlinks) |
| `cdd agents sync [--dry-run]` | Update CDD agent prompts to the latest version |

### Common options

- `--cwd <dir>`: Set working directory (default: current directory)
- `--raw` / `--json`: Force JSON output (enabled automatically in CI)
- `-h, --help`: Show help
