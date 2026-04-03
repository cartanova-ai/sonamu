---
name: sonamu-cone
description: Guide for creating and managing cone metadata. Used for fixture generation, documentation, and search across Entity fields. Supports LLM-based or template-based generation. Use when creating or managing cone metadata for entities.
---

# Cone Metadata Guide

Cone is metadata for each prop, subset, and enum of an Entity.
During fixture generation, the LLM references `cone.note` to produce realistic, context-appropriate data.

---

## Role of Cone

| Purpose | Description |
|---------|-------------|
| **Fixture generation** | LLM generates contextually appropriate test data based on `cone.note` |
| **Scaffolding** | Uses cone information to generate model and view templates |
| **Documentation** | Metadata describing Entity structure and the meaning of each field |

---

## Cone Field Types

### Entity cone

| Field | Type | Description |
|-------|------|-------------|
| `note` | string | Entity purpose, business context, and fixture generation guide |
| `tags` | string[] | Classification tags |

### Prop cone

| Field | Type | Description |
|-------|------|-------------|
| `note` | string | **Highest priority.** Business meaning of the field, concrete examples, value ranges, format constraints. Input the LLM reads to generate data |
| `fixtureGenerator` | string | **Fallback.** faker.js expression. Fallback when no API key is available |
| `fixtureDefault` | any | Fixed default value |
| `fixtureStrategy` | string | `"sequence"` — used when id is auto-assigned by a DB sequence |
| `dataSource` | object | Strategy for fetching reference data for relation props |

### Subset cone

| Field | Type | Description |
|-------|------|-------------|
| `note` | string | Subset purpose, included fields, and when it is used |

### Enum cone

| Field | Type | Description |
|-------|------|-------------|
| `note` | string | Meaning and usage context of the enum |
| `values` | object | `{ note: string }` for each enum value |

---

## Priority During Fixture Generation

When the `--use-llm` flag is used:

```
1. override value (passed at generate() call time)
2. cone.note + LLM  ← highest priority when API key is present
3. fixtureGenerator (faker.js expression)  ← fallback when LLM fails
4. fixtureDefault (fixed default value)
5. type-based default (auto-generated)
```

**CRITICAL: If `cone.note` is empty, the LLM generates data without context, resulting in poor quality. Always verify that cone.note exists before running fixture generation.**

---

## CLI Commands

### 1. cone gen — Generate cone with LLM (recommended)

Passes the project requirements (`.claude/skills/project/*.md`) and Entity structure to the LLM to generate contextually appropriate cone.

**Requires ANTHROPIC_API_KEY** (`.env` or `sonamu.config.ts`'s `secret.anthropic_api_key`)

```bash
# Single Entity
pnpm sonamu cone gen Post

# All Entities
pnpm sonamu cone gen --all

# Regenerate all existing cones (overwrite)
pnpm sonamu cone gen Post --regenerate

# Regenerate all Entities
pnpm sonamu cone gen --all --regenerate

# Specify locale
pnpm sonamu cone gen Post --locale en
```

#### Options

| Option | Description |
|--------|-------------|
| `--all` | Generate cone for all Entities |
| `--regenerate` | Overwrite existing cone (default: only generate for fields with no note) |
| `--locale <ko\|en\|ja>` | Generation language (default: `i18n.defaultLocale` from `sonamu.config.ts`, or `ko`) |

#### How it works

- **Default mode**: `onlyEmpty` — only generates for props where cone.note is empty; existing notes are preserved
- **`--regenerate` mode**: full regeneration, overwrites existing cone

#### Information referenced by the LLM

1. Entity JSON structure (props, subsets, enums, relations)
2. Domain rule files (`contract/**/*.contract.md`)
3. Existing cone metadata (in preserve mode)

### 2. stub entity — Auto-generate cone when creating an Entity

```bash
# Default: auto-generate template cone (no API key required)
pnpm sonamu stub entity Post

# Generate cone with LLM
pnpm sonamu stub entity Post --ai

# Skip cone generation
pnpm sonamu stub entity Post --no-cones
```

#### Template cone vs LLM cone

| Item | Template cone | LLM cone |
|------|--------------|----------|
| API key | Not required | Required |
| Quality | Defaults based on faker-mappings | Reflects project context |
| Speed | Immediate | Takes a few seconds |
| Upgrade | Can be upgraded with `cone gen` | — |

---

## Key Cone Patterns

### General field

```json
{
  "name": "title",
  "type": "string",
  "cone": {
    "note": "Post title. A Korean title roughly 20–50 characters long",
    "fixtureGenerator": "faker.lorem.sentence()"
  }
}
```

### Relation field (BelongsToOne)

```json
{
  "name": "author",
  "type": "relation",
  "with": "User",
  "relationType": "BelongsToOne",
  "cone": {
    "note": "Post author. References existing User data",
    "dataSource": {
      "strategy": "recent",
      "config": { "limit": 5 }
    }
  }
}
```

### Correlated fields (name + name_en, etc.)

Do not set `fixtureGenerator` on correlated fields. The LLM generates them together per row to ensure consistency.

```json
{
  "name": "name",
  "cone": { "note": "Korean name (e.g. 김민수)" }
},
{
  "name": "name_en",
  "cone": { "note": "Romanized form of name (e.g. Kim Minsu). Must refer to the same person as name" }
}
```

### DB sequence PK

```json
{
  "name": "id",
  "type": "string",
  "cone": {
    "fixtureStrategy": "sequence",
    "note": "Sequential number automatically assigned by the DB sequence (stored as string)"
  }
}
```

### better-auth entity PK (Account / Session / Verification)

The id of entities managed by better-auth is a UUID generated via `crypto.randomUUID()`.
Using `fixtureStrategy: "sequence"` causes a `MAX(id::bigint)` error during fixture sync, so always use `fixtureGenerator: "faker.string.uuid()"`.

```json
{
  "name": "id",
  "type": "string",
  "cone": {
    "note": "UUID-format identifier generated by better-auth via crypto.randomUUID()",
    "fixtureGenerator": "faker.string.uuid()"
  }
}
```

### Enum field

```json
{
  "name": "status",
  "type": "enum",
  "cone": {
    "note": "Post status. One of draft/published/archived"
  }
}
```

---

## dataSource Strategies

Specifies how reference data is fetched for relation props.

| Strategy | Description |
|----------|-------------|
| `recent` | Most recent data (by created_at) |
| `sample` | Uniform sampling |
| `random` | Random sampling |
| `ids` | Specific IDs |
| `query` | Custom query |
| `file` | Load from file |

```json
"dataSource": {
  "strategy": "recent",
  "config": { "limit": 5 }
}
```

### DataExplorer Options Detail

**Source:** `modules/sonamu/src/testing/data-explorer.ts`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `strategy` | string | — | Fetch strategy (see table above) |
| `limit` | number | — | Maximum number of records to fetch |
| `where` | object \| function | — | WHERE condition (object or Knex QueryBuilder function) |
| `orderBy` | string | — | Sort criteria |
| `ids` | number[] | — | Specific ID list for `ids` strategy |
| `filePath` | string | — | File path for `file` strategy |
| `useCache` | boolean | `false` | Whether to use caching |
| `cacheTtl` | number | `300` | Cache TTL (in seconds) |

**Example using a where condition:**

```json
"dataSource": {
  "strategy": "sample",
  "config": {
    "limit": 5,
    "where": { "status": "active" }
  }
}
```

### Relation Traversal Options (ExploreWithRelationsOptions)

Used in `fixture gen` to fetch related data alongside the target data.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `includeRelations` | boolean | `true` | Whether to include related data |
| `maxDepth` | number | `2` | Maximum depth for recursive traversal |

---

## Practical Tips

### Writing effective cone.note

**note is the primary input for fixture data generation.** The LLM reads note to produce contextually appropriate data, so it must contain specific, domain-specialized content.

- **Be specific**: "Korean phone number in 010-XXXX-XXXX format" rather than "string"
- **Include business context**: "Employee salary. Range: 30,000,000–150,000,000 KRW"
- **Include concrete examples**: "e.g. AI-based drug discovery platform development, eco-friendly energy storage system development"
- **State value ranges explicitly**: "Between 50,000,000 (50,000) and 5,000,000,000 (5,000,000)"
- **Describe correlated fields**: "name_en must be the romanized form of name"
- **Specify length/format constraints**: "Korean self-introduction, 20–100 characters"

### Improving LLM cone generation quality

1. Record domain rules and decision rationale in detail in `contract/{domain}/{domain}.contract.md`
2. Run `cone gen` — the LLM uses `contract/**/*.contract.md` as context

### When to regenerate cone

- After adding a new prop to an Entity
- After a business requirement change
- When fixture data quality is poor
- Running without `--regenerate` preserves existing notes and only fills in empty ones

---

## References

- **Fixture CLI**: `fixture-cli.md` — fixture gen/fetch/explore commands
- **Testing**: `testing.md` — writing tests and using fixtures
- **Source code**: `modules/sonamu/src/cone/cone-generator.ts`
- **Template cone**: `modules/sonamu/src/entity/entity-template-cone.ts`
