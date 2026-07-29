---
name: sonamu-fixture
description: Generates and manages Sonamu test data. Use when running fixture gen/fetch/explore, writing cone.note metadata for LLM generation, syncing between the development, test, and fixture databases, or when a fixture fails on a foreign key or unique constraint. Covers the 3-tier DB structure, dataSource strategies, fixtureGenerator, and --use-llm.
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

| DB                | Purpose                          | Data origin                             |
| ----------------- | -------------------------------- | --------------------------------------- |
| `project`         | Production/development live DB   | Real user data                          |
| `project_fixture` | Reference data store for testing | Imported via fetch or generated via gen |
| `project_test`    | Test execution environment       | Synced from fixture                     |

### Which DB Each Command Uses

| Command         | sourceDb          | targetDb   | Description                                            |
| --------------- | ----------------- | ---------- | ------------------------------------------------------ |
| `fixture gen`   | fixture DB        | fixture DB | Resolves and generates relations within the fixture DB |
| `fixture fetch` | production master | fixture DB | Imports from live DB → fixture DB                      |
| `fixture sync`  | fixture DB        | test DB    | Synchronizes fixture DB → test DB (existing behavior)  |

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
- `--llm-model <model>`: Specify LLM model (default: `claude-sonnet-4-6`)

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

| Strategy | Description                      | Example                        |
| -------- | -------------------------------- | ------------------------------ |
| `recent` | Most recent data (by created_at) | `--strategy recent --limit 10` |
| `sample` | Uniform sampling                 | `--strategy sample --limit 10` |
| `random` | Random sampling                  | `--strategy random --limit 10` |

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


## Reference Map

| Need | Read |
| --- | --- |
| Practical scenarios, tips, cone metadata options, FixtureGenerator, troubleshooting | `references/cli-usage.md` |
| Cone field types, generation priority, cone CLI, dataSource strategies | `references/cone.md` |
