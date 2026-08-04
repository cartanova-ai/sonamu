# Cone Metadata

## Role of Cone

| Purpose                | Description                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| Fixture generation | LLM generates contextually appropriate test data based on `cone.note` |
| Scaffolding        | Uses cone information to generate model and view templates            |
| Documentation      | Metadata describing Entity structure and the meaning of each field    |

## Cone Field Types

### Entity cone

| Field  | Type     | Description                                                    |
| ------ | -------- | -------------------------------------------------------------- |
| `note` | string   | Entity purpose, business context, and fixture generation guide |
| `tags` | string[] | Classification tags                                            |

### Prop cone

| Field              | Type   | Description                                                                                                                                    |
| ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `note`             | string | Highest priority. Business meaning of the field, concrete examples, value ranges, format constraints. Input the LLM reads to generate data |
| `fixtureGenerator` | string | Fallback. faker.js expression. Fallback when no API key is available                                                                       |
| `fixtureDefault`   | any    | Fixed default value                                                                                                                            |
| `fixtureStrategy`  | string | `"sequence"` — used when a DB sequence auto-assigns the id. Never use on string PK.                                                            |
| `dataSource`       | object | Strategy for fetching reference data for relation props                                                                                        |

### Subset cone

| Field  | Type   | Description                                          |
| ------ | ------ | ---------------------------------------------------- |
| `note` | string | Subset purpose, included fields, and when it is used |

### Enum cone

| Field    | Type   | Description                            |
| -------- | ------ | -------------------------------------- |
| `note`   | string | Meaning and usage context of the enum  |
| `values` | object | `{ note: string }` for each enum value |

## Priority During Fixture Generation

When the `--use-llm` flag is used:

```
1. override value (passed at generate() call time)
2. cone.note + LLM  ← highest priority when API key is present
3. fixtureGenerator (faker.js expression)  ← fallback when LLM fails
4. fixtureDefault (fixed default value)
5. type-based default (auto-generated)
```

With an empty `cone.note`, the LLM has no domain context to condition on and falls back to generic
values — the generation still succeeds, so the effect shows up as unrealistic fixture data rather
than an error.

## CLI Commands

### 1. cone gen — Generate cone with LLM (recommended)

Passes the domain rules (`contract/**/*.contract.md`) and Entity structure to the LLM to generate contextually appropriate cone.

Requires ANTHROPIC_API_KEY (`.env` or `sonamu.config.ts`'s `secret.anthropic_api_key`)

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

| Option                  | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `--all`                 | Generate cone for all Entities                                                       |
| `--regenerate`          | Overwrite existing cone (default: only generate for fields with no note)             |
| `--locale <ko\|en\|ja>` | Generation language (default: `i18n.defaultLocale` from `sonamu.config.ts`, or `ko`) |

#### How it works

- Default mode: `onlyEmpty` — only generates for props where cone.note is empty; existing notes are preserved
- `--regenerate` mode: full regeneration, overwrites existing cone

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

| Item    | Template cone                    | LLM cone                 |
| ------- | -------------------------------- | ------------------------ |
| API key | Not required                     | Required                 |
| Quality | Defaults based on faker-mappings | Reflects project context |
| Speed   | Immediate                        | Takes a few seconds      |
| Upgrade | Can be upgraded with `cone gen`  | —                        |

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

### String PK

Never set `fixtureStrategy: "sequence"` or `fixtureGenerator` on an id prop with `type: "string"`.
fixture-generator automatically generates `alphanumeric(32)`.

```json
{
  "name": "id",
  "type": "string",
  "cone": {
    "note": "Random alphanumeric string ID (32 chars, [a-zA-Z0-9]). Generated by better-auth via generateId()"
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

## dataSource Strategies

Specifies how reference data is fetched for relation props.

| Strategy | Description                      |
| -------- | -------------------------------- |
| `recent` | Most recent data (by created_at) |
| `sample` | Uniform sampling                 |
| `random` | Random sampling                  |
| `ids`    | Specific IDs                     |
| `query`  | Custom query                     |
| `file`   | Load from file                   |

```json
"dataSource": {
  "strategy": "recent",
  "config": { "limit": 5 }
}
```

### DataExplorer Options Detail

Source: `modules/sonamu/src/testing/data-explorer.ts`

| Option     | Type               | Default | Description                                            |
| ---------- | ------------------ | ------- | ------------------------------------------------------ |
| `strategy` | string             | —       | Fetch strategy (see table above)                       |
| `limit`    | number             | —       | Maximum number of records to fetch                     |
| `where`    | object \| function | —       | WHERE condition (object or Knex QueryBuilder function) |
| `orderBy`  | string             | —       | Sort criteria                                          |
| `ids`      | number[]           | —       | Specific ID list for `ids` strategy                    |
| `filePath` | string             | —       | File path for `file` strategy                          |
| `useCache` | boolean            | `false` | Whether to use caching                                 |
| `cacheTtl` | number             | `300`   | Cache TTL (in seconds)                                 |

Example using a where condition:

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

| Option             | Type    | Default | Description                           |
| ------------------ | ------- | ------- | ------------------------------------- |
| `includeRelations` | boolean | `true`  | Whether to include related data       |
| `maxDepth`         | number  | `2`     | Maximum depth for recursive traversal |

## Practical Tips

### Writing effective cone.note

note is the primary input for fixture data generation. The LLM reads note to produce contextually appropriate data, so it must contain specific, domain-specialized content.

- Be specific: "Korean phone number in 010-XXXX-XXXX format" rather than "string"
- Include business context: "Employee salary. Range: 30,000,000–150,000,000 KRW"
- Include concrete examples: "e.g. AI-based drug discovery platform development, eco-friendly energy storage system development"
- State value ranges explicitly: "Between 50,000,000 (50,000) and 5,000,000,000 (5,000,000)"
- Describe correlated fields: "name_en must be the romanized form of name"
- Specify length/format constraints: "Korean self-introduction, 20–100 characters"

### Improving LLM cone generation quality

If the project keeps domain rules under `contract/{domain}/{domain}.contract.md`, `cone gen` picks
them up as context automatically — the more concrete those rules are, the closer generated notes land
to the real domain. Projects without that directory are unaffected; the entity JSON and existing cone
metadata are still used.

### When to regenerate cone

- After adding a new prop to an Entity
- After a business requirement change
- When fixture data quality is poor
- Running without `--regenerate` preserves existing notes and only fills in empty ones

## References

- Fixture CLI: this skill — fixture gen/fetch/explore commands
- Testing: `sonamu-testing` — writing tests and using fixtures
- Source code: `modules/sonamu/src/cone/cone-generator.ts`
- Template cone: `modules/sonamu/src/entity/entity-template-cone.ts`
