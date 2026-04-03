---
name: sonamu-fixture-cli
description: Sonamu Fixture CLI usage guide. Create and manage test data with the fixture gen/fetch/explore commands. Use when creating or managing fixture data.
---

# Fixture CLI Usage Guide

Sonamu provides CLI commands for generating and managing fixture data for testing.

**Note**: See the "Practical Tips" section below for fixture generation tips.

---

## Understanding the 3-Tier DB Structure (Required)

Sonamu uses a three-tier database structure. **Without understanding this structure, using fixture commands will be confusing.**

```
production/development master (live DB)
          ↓ (fixture fetch)
     project_fixture (fixture DB)
          ↓ (fixture sync)
       project_test (test DB)
```

### Role of Each DB

| DB | Purpose | Data origin |
|----|---------|-------------|
| `project` | Production/development live DB | Real user data |
| `project_fixture` | Reference data store for testing | Imported via fetch or generated via gen |
| `project_test` | Test execution environment | Synced from fixture |

### Which DB Each Command Uses

| Command | sourceDb | targetDb | Description |
|---------|----------|----------|-------------|
| `fixture gen` | fixture DB | fixture DB | Resolves and generates relations within the fixture DB |
| `fixture fetch` | production master | fixture DB | Imports from live DB → fixture DB |
| `fixture sync` | fixture DB | test DB | Synchronizes fixture DB → test DB (existing behavior) |

**CRITICAL**: Incorrect sourceDb or targetDb settings will cause FK reference errors.

---

## CLI Commands

### 1. fixture gen - Generate new fixtures

Generates new test data based on faker.

**CRITICAL: The `--use-llm` option must always be used in real projects.** Without `--use-llm`, domain context from cone.note is not applied and only faker defaults are used, potentially producing meaningless data. This option is required for the LLM to reference `contract/**/*.contract.md` and generate contextually appropriate data.

**CRITICAL: Before running fixture gen, verify that `cone.note` exists for key props.** Without cone.note, the LLM cannot understand context and cannot generate meaningful data. If cone.note is insufficient, regenerate it with `pnpm sonamu cone generate --use-llm`.

#### Basic Usage

```bash
# Interactive mode (recommended)
pnpm sonamu fixture gen

# Specify Entity
pnpm sonamu fixture gen --include User --count 10

# Multiple Entities
pnpm sonamu fixture gen --include User,Post,Comment --count 5

# All Entities
pnpm sonamu fixture gen --all --count 3

# All minus exclusions
pnpm sonamu fixture gen --all --exclude Admin,Log --count 3
```

#### Save Options

```bash
# Save to DB (default)
pnpm sonamu fixture gen --include User --count 10 --save-to db

# Save to file (tablename.json)
pnpm sonamu fixture gen --include User --count 10 --save-to file
# → test/fixtures/users.json

# Specify filename
pnpm sonamu fixture gen --include User --count 10 --save-to file:my-users.json
# → test/fixtures/my-users.json

# Output only (do not save)
pnpm sonamu fixture gen --include User --count 10 --save-to none
```

#### Options

- `--include <entities>`: List of Entities to generate (comma-separated)
- `--all`: All Entities
- `--exclude <entities>`: Used with --all; Entities to exclude
- `--count <number>`: Number to generate per Entity (default: 5)
- `--save-to <target>`: Save mode - `db` | `file` | `file:name.json` | `none`
- `--use-llm`: Enable LLM-based generation from cone.note (requires ANTHROPIC_API_KEY)
- `--no-cache`: Disable LLM cache (default: cache ON)
- `--llm-model <model>`: Specify LLM model (default: `claude-sonnet-4-5`)

---

### 2. fixture fetch - Import from live DB

Fetches data from the production/development DB and saves it to the fixture DB.

#### Basic Usage

```bash
# Interactive mode
pnpm sonamu fixture fetch

# Fetch recent data
pnpm sonamu fixture fetch --include User --strategy recent --limit 10

# Multiple Entities
pnpm sonamu fixture fetch --include User,Post --strategy sample --limit 5

# All Entities
pnpm sonamu fixture fetch --all --strategy recent --limit 3
```

#### Strategies

| Strategy | Description | Example |
|----------|-------------|---------|
| `recent` | Most recent data (by created_at) | `--strategy recent --limit 10` |
| `sample` | Uniform sampling | `--strategy sample --limit 10` |
| `random` | Random sampling | `--strategy random --limit 10` |

**CRITICAL**: fetch retrieves related data **recursively** (maxDepth: 2)
- Fetching User → also imports User's department and institution
- Fetching Post → also imports Post's author (User)

#### Options

- `--include <entities>`: List of Entities to import
- `--all`: All Entities
- `--exclude <entities>`: Used with --all; Entities to exclude
- `--strategy <strategy>`: Fetch strategy - `recent` | `sample` | `random` (default: recent)
- `--limit <number>`: Number of records per Entity (default: 10)

---

### 3. fixture explore - Query data (without saving)

Queries data from the live DB and prints it to the console. **Query only — nothing is saved.**

#### Basic Usage

```bash
# Interactive mode
pnpm sonamu fixture explore

# Query recent Users
pnpm sonamu fixture explore --include User --strategy recent --limit 10

# Sampling
pnpm sonamu fixture explore --include Department --strategy sample --limit 5
```

#### When to use

- Quickly check what data exists in the live DB
- Preview before running fixture fetch
- Understand data distribution

---

## Practical Scenarios

### Scenario 1: Starting from an empty DB

```bash
# 1. Generate base fixtures
pnpm sonamu fixture gen --all --exclude Admin,Log --count 5

# 2. Sync fixture → test DB
pnpm sonamu fixture sync

# 3. Run tests
pnpm test
```

### Scenario 2: Testing with real data

```bash
# 1. Fetch recent data from live DB
pnpm sonamu fixture fetch --include User,Department --strategy recent --limit 20

# 2. Generate additional data
pnpm sonamu fixture gen --include Post,Comment --count 50

# 3. Sync fixture → test DB
pnpm sonamu fixture sync

# 4. Run tests
pnpm test
```

### Scenario 3: Preparing for a specific scenario test

```bash
# 1. Generate specific Entities only
pnpm sonamu fixture gen --include User --count 3

# 2. Generate additional interactively
pnpm sonamu fixture gen
# ? Select entities to generate fixtures for: choose Post, Comment
# ? Count per entity: 10

# 3. Save to file (for version control)
pnpm sonamu fixture gen --include User --count 10 --save-to file
# → creates test/fixtures/users.json

# 4. fixture sync
pnpm sonamu fixture sync
```

---

## Practical Tips

### 1. Automatic Korean data generation

FixtureGenerator automatically generates Korean data for specific field names:

**Fields with automatic Korean generation**:
- `name`, `username`: Korean full name (`fakerKO.person.fullName()`)
- Entity is `Department` and prop is `name`: Korean department name

**Example output**:
```typescript
// User
{ name: "김민준", username: "이서연" }

// Department
{ name: "개발팀 1팀", name: "글로벌 마케팅팀" }
```

**Customization**:
```typescript
// Edit in fixture-generator.ts
if (entity?.id === "Department" && prop.name === "name") {
  const departments = ["개발팀", "기획팀", "마케팅팀", "영업팀"];
  // ...
}
```

### 2. Handling Unique Constraints

Fields with unique constraints require a deduplication strategy.

**Problem**:
```sql
-- departments table
UNIQUE (company_id, name)
```

**Solution: Automatic variation**
```typescript
// Prevents "개발팀" from being generated multiple times under the same company_id
// Automatically adds prefix/suffix with 70% probability

// Result:
"개발팀"           // 30%
"개발팀 1팀"       // 20%
"개발팀 본부"      // 20%
"글로벌 개발팀"    // 30%
```

**Implementation location**: `generateDefaultValue()` in `fixture-generator.ts`

### 3. BelongsToOne FK Setup

BelongsToOne relations auto-generate a `{name}_id` column, so code must use the `_id` suffix.

**Entity definition**:
```json
{
  "type": "relation",
  "name": "company",
  "with": "Company",
  "relationType": "BelongsToOne"
}
```

**Inside FixtureGenerator**:
```typescript
// ✓ CORRECT
fixture[`${prop.name}_id`] = relationValue;  // company_id

// ✗ WRONG
fixture[prop.name] = relationValue;  // company (FK saved as NULL!)
```

**Easy to get wrong because**:
- Entity JSON defines `name: "company"`
- DB column is auto-created as `company_id`
- Code must use `company_id`

### 4. Resolving Ordering Issues

fixture gen **automatically sorts by dependency order** (uses FixtureManager's RelationGraph).

**Example**:
```bash
# Department references Company, but no need to worry about order
pnpm sonamu fixture gen --include Department,Company --count 5

# Internally:
# 1. Company generated first (no FK)
# 2. Department generated next (references company_id)
```

**Note**: Circular references will produce a warning.

**Internal implementation (RelationGraph):**

`FixtureManager` uses the `RelationGraph` class (`_relation-graph.ts`) to build a dependency graph and topologically sort it to determine insertion order. It analyzes BelongsToOne and OneToOne (hasJoinColumn) relations to guarantee that parent entities are always inserted before children.

### 5. DB Sequence Reset

After generating fixtures, ID sequences may be out of sync.

**Check**:
```bash
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture -c "
SELECT sequencename, last_value
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY sequencename;
"
```

**Reset**:
```sql
-- Per table
SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments), true);
SELECT setval('companies_id_seq', (SELECT MAX(id) FROM companies), true);
```

**Automated**:
```bash
# Reset all sequences script
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture -c "
SELECT 'SELECT setval(''' || sequencename || ''', (SELECT COALESCE(MAX(id), 1) FROM ' ||
  replace(sequencename, '_id_seq', '') || '), true);'
FROM pg_sequences
WHERE schemaname = 'public' AND sequencename LIKE '%_id_seq';
" | grep SELECT | PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_fixture
```

### 6. Using File Storage

Saving to file enables **version control**.

```bash
# 1. Save to file
pnpm sonamu fixture gen --include User --count 10 --save-to file
# → test/fixtures/users.json

# 2. Commit to git
git add test/fixtures/users.json
git commit -m "Add user fixtures for testing"

# 3. Other developers can test with the same data
```

**When to use**:
- Consistent test data needed in CI/CD environments
- Reproducing specific scenarios
- Sharing test data across team members

---

## Advanced: cone Metadata (Optional)

Adding `cone` metadata to Entity JSON gives you finer control over fixture generation.

### dataSource - Specify a reference strategy

```json
{
  "name": "Post",
  "props": [
    {
      "name": "author",
      "type": "relation",
      "with": "User",
      "relationType": "BelongsToOne",
      "cone": {
        "dataSource": {
          "strategy": "recent",
          "config": { "limit": 5 }
        }
      }
    }
  ]
}
```

**Supported strategies**:
- `sample`: Uniform sampling
- `recent`: Most recent data (by created_at)
- `random`: Random sampling
- `ids`: Specific IDs
- `query`: Custom query
- `file`: Load from file

### fixtureGenerator - Custom generation logic

```json
{
  "name": "email",
  "type": "string",
  "cone": {
    "fixtureGenerator": "faker.internet.email()"
  }
}
```

**Security note**: Security risk due to eval usage (only use trusted expressions)

### fixtureDefault - Specify a default value

```json
{
  "name": "status",
  "type": "string",
  "cone": {
    "fixtureDefault": "active"
  }
}
```

### note - Description and LLM trigger

```json
{
  "name": "phone",
  "type": "string",
  "cone": {
    "note": "Korean phone number in 010-XXXX-XXXX format"
  }
}
```

**How it works**:
- Without `--use-llm`: serves only as a reference description for developers/LLMs (used by cone-generator when generating metadata)
- With `--use-llm`: fixture gen calls the Claude API and generates actual values based on the note content

**Use cases**:
- Contextual text that is hard to express with simple faker.js (self-introductions, descriptions, etc.)
- Explaining the field's meaning and generation pattern to developers
- No length limit (short patterns or long descriptions are both fine)

---

### LLM-based Data Generation

When the `--use-llm` flag is used, `cone.note` acts as the trigger for Claude API calls.

#### Priority chain

```
1. override value (passed at generate() call time)
2. cone.note + LLM  ← activated with --use-llm flag (highest priority when API key is present)
3. fixtureGenerator (faker.js expression)  ← fallback when LLM fails
4. fixtureDefault (fixed default value)
5. type-based default (auto-generated)
```

#### CLI usage

```bash
# Enable LLM
pnpm sonamu fixture gen --include User --count 10 --use-llm

# Disable cache
pnpm sonamu fixture gen --include User --count 10 --use-llm --no-cache
```

#### API Key Setup

```bash
# Option 1: environment variable
export ANTHROPIC_API_KEY=sk-ant-...

# Option 2: sonamu.config.ts
export default defineConfig({
  secret: { anthropic_api_key: "sk-ant-..." }
});
```

#### Caching behavior

- When `useLLM=true`, all LLM-targeted fields in a single row are generated in **a single LLM call** (not per-field individual calls)
- This single call guarantees automatic consistency across correlated fields such as `name`, `name_en`, `name_cn`, `email`
- Generated results are stored in an in-memory cache keyed by `rowKey:fieldName`, and returned immediately for subsequent fields in the same row
- Cache is valid only within the same FixtureGenerator instance
- Cache can be disabled with `--no-cache` (the row-level generation approach itself is preserved)

#### Fallback behavior

- No API key → falls back to fixtureDefault or type default (no error)
- LLM call fails → same fallback (console warning only)

#### When to choose note vs fixtureGenerator

| Situation | Recommended |
|-----------|-------------|
| Simple values such as email, name, number | `fixtureGenerator` (faker.js) |
| Contextual text such as self-introductions or descriptions | `cone.note` + `--use-llm` (LLM) |
| Selecting from a specific list of values | `fixtureGenerator` (arrayElement) |

---

## FixtureGenerator Options (FixtureGeneratorOptions)

**Source:** `modules/sonamu/src/testing/fixture-generator.ts`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `locale` | `"ko"` \| `"en"` \| `"ja"` | `"ko"` | Locale for generated data |
| `useLLM` | boolean | `false` | LLM-based data generation (`--use-llm`) |
| `enableLLMCache` | boolean | `true` | Cache LLM results (disable with `--no-cache`) |
| `llmModel` | string | `"claude-sonnet-4-5"` | LLM model to use |

---

## Troubleshooting

### Problem 1: "Cannot generate non-nullable relation without dataSource"

**Cause**: BelongsToOne relation is non-nullable but there is no data to reference

**Solution**:
```bash
# Generate the referenced Entity first
pnpm sonamu fixture gen --include Company --count 5

# Then generate Department
pnpm sonamu fixture gen --include Department --count 10
```

Or:
```bash
# Generate together (auto-sorted by dependency order)
pnpm sonamu fixture gen --include Company,Department --count 5
```

### Problem 2: "duplicate key value violates unique constraint"

**Cause**: Duplicate values generated for a field with a unique constraint

**Solution**:
1. Modify the per-field generation logic for that Entity in `fixture-generator.ts`
2. Add prefix/suffix or use UUID
3. Reduce count

### Problem 3: FK reference error "violates foreign key constraint"

**Cause**: Incorrect sourceDb/targetDb configuration

**Check**:
```typescript
// Verify in fixture.ts
const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
const generator = new FixtureGenerator(fixtureDb, fixtureDb, "fixture", EntityManager);
```

**Correct configuration**:
- `fixture gen`: sourceDb = fixtureDb, targetDb = fixtureDb
- `fixture fetch`: sourceDb = production, targetDb = fixtureDb

---

## References

- **3-Tier DB Structure**: "3-Tier DB Structure" section in `database.md`
- **Fixture generation tips**: "Fixture Data Generation Tips" section in `testing.md`
- **BelongsToOne FK**: "Using FK in Code" section in `entity-relations.md`
- **Implementation**: `modules/sonamu/src/bin/fixture.ts`
- **Generation logic**: `modules/sonamu/src/testing/fixture-generator.ts`
