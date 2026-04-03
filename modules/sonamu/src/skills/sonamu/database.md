---
name: sonamu-database
description: Sonamu database configuration, Seed Data management, troubleshooting. Docker port conflicts, DB connection configuration. Use when database issues occur.
---

# Database Configuration

## Starting Docker DB

```bash
cd packages/api
pnpm docker:up
```

## 3-Tier DB Structure

Sonamu uses a 3-tier database structure. It is important to understand the role of each DB and the data flow.

```
production/development master (actual DB)
          ↓ (fixture fetch)
     project_fixture (fixture DB)
          ↓ (fixture sync)
       project_test (test DB)
```

### Role of Each DB

| DB | Purpose | Data Source | Command |
|----|---------|------------|---------|
| `project` | Production/development actual DB | Real user data | Created directly |
| `project_fixture` | Reference data store for testing | Fetched from production or generated with gen | `pnpm sonamu fixture gen/fetch` |
| `project_test` | Test execution environment | Synced from fixture | `pnpm sonamu fixture sync` |

### Data Flow

**1. fixture fetch (fetch real data)**
```bash
pnpm sonamu fixture fetch --include User --limit 10
```
- production/development master → fixture DB
- Copies actual production data for testing
- Related data (FKs) is also fetched

**2. fixture gen (generate dummy data)**
```bash
pnpm sonamu fixture gen --include Department --count 5
```
- Generated inside fixture DB using faker
- Automatically resolves reference relationships (FKs)
- Supports Korean data generation

**3. fixture sync (sync test DB)**
```bash
pnpm sonamu fixture sync
```
- fixture DB → test DB
- Sync to the latest state before running tests
- Each test is isolated with a transaction that auto-rolls back

### Notes

**CRITICAL: Prevent sourceDb vs targetDb confusion**

- `fixture gen`: sourceDb=fixture, targetDb=fixture (generated inside fixture)
- `fixture fetch`: sourceDb=production, targetDb=fixture (production → fixture)
- Incorrect configuration causes FK reference errors

**Example (correct configuration)**:
```typescript
// fixture gen: reference and save within fixture DB
const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
const generator = new FixtureGenerator(fixtureDb, fixtureDb, "fixture", EntityManager);

// fixture fetch: production → fixture DB
const sourceDb = DB.getDB("r"); // production_master
const fixtureDb = createKnexInstance(Sonamu.dbConfig.fixture);
const generator = new FixtureGenerator(sourceDb, fixtureDb, "fixture", EntityManager);
```

**Note**: For detailed Fixture CLI command usage, see `fixture-cli.md`

---

## Seed Data Management

Base data for testing (seed data) is managed by adding it to dump files.

### Overall Workflow

Seed data management proceeds in 2 phases:

| Phase | Purpose | Target DB |
|-------|---------|-----------|
| **Phase 1** | Prepare seed for development/testing | `project_test`, `project_fixture` |
| **Phase 2** | Apply seed to the actual DB | `project` (actual DB) |

---

### Phase 1: Prepare Seed for Development/Testing

The step of preparing dummy data for testing during development.

#### 1-1. Generate Initial Dump (Table Structure Only)

```bash
pnpm dump
```

The `database/scripts/dump.sql` generated at this point contains:
- CREATE TABLE statements
- CREATE SEQUENCE statements
- ALTER TABLE ... PRIMARY KEY
- ALTER TABLE ... FOREIGN KEY
- **No INSERT statements** (no data yet)

#### 1-2. Add INSERT Statements to Dump File

Open `database/scripts/dump.sql` and add INSERT statements **before the FK CONSTRAINT** section.

**Important: Write in order considering FK dependency order**
```sql
-- Independent tables first
INSERT INTO public.institutions (id, created_at, name, code) VALUES
  (1, '2024-01-01 00:00:00+09', 'Headquarters', 'HQ');

-- Reference tables (referencing institutions)
INSERT INTO public.departments (id, created_at, name, code, institution_id) VALUES
  (1, '2024-01-01 00:00:00+09', 'Research', 'RND', 1);

-- Set sequence values (after INSERT)
SELECT pg_catalog.setval('public.institutions_id_seq', 1, true);
SELECT pg_catalog.setval('public.departments_id_seq', 1, true);
```

#### 1-3. Apply to Test DB

```bash
pnpm seed
```

`database/scripts/seed.sh` runs and:
- `SOURCE_DB="${DATABASE_NAME}_test"` → applies dump.sql to the test DB

#### 1-4. Sync to Fixture DB

```bash
pnpm sonamu fixture sync
```

Copies test DB data to the fixture DB.

---

### Phase 2: Apply Seed to Actual DB

**⚠️ CRITICAL WARNING:**
- This step inserts data into the actual DB (`project`)
- Existing data may be overwritten
- **You must confirm with the user before proceeding**

**Claude Code Rules:**
```
Before applying seed to the actual DB:
1. Ask the user: "Would you like to apply seed data to the actual database (project)?"
2. Only proceed when the user explicitly approves
3. Never run without approval
```

#### 2-1. Verify Current State

```bash
# Data must already be in test/fixture DBs
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test -c "SELECT COUNT(*) FROM users;"
```

#### 2-2. Generate Final Dump

```bash
# Generate a dump that includes test/fixture data
pnpm dump
```

This dump **includes INSERT statements** (the data added in step 1-2).

#### 2-3. Modify seed.sh File

Open `database/scripts/seed.sh` and change FIXTURE_DB:

```bash
# Before (development/testing phase)
FIXTURE_DB="${DATABASE_NAME}_fixture"

# After (seeding actual DB)
FIXTURE_DB="${DATABASE_NAME}"
```

#### 2-4. Run Seed on Actual DB

**⚠️ Run only after user approval:**

```bash
pnpm seed
```

Seed data is now applied to the actual DB (`project`).

#### 2-5. Verify

```bash
# Verify data in actual DB
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project -c "SELECT * FROM departments LIMIT 5;"
```

#### 2-6. Restore seed.sh (Important!)

After the actual DB seed is complete, restore seed.sh to its original state so the next development cycle uses the test DB:

```bash
# database/scripts/seed.sh
FIXTURE_DB="${DATABASE_NAME}_fixture"  # restored
```

---

### Summary: Phase 1 vs Phase 2

| Item | Phase 1 (Development/Testing) | Phase 2 (Actual DB) |
|------|-------------------------------|---------------------|
| **Timing** | Preparing test data during development | Preparing actual data after development is complete |
| **Dump count** | 1 time (table structure) | 2 times (includes data) |
| **Target DB** | `project_test` → `project_fixture` | `project` |
| **seed.sh** | `FIXTURE_DB="${DATABASE_NAME}_fixture"` | `FIXTURE_DB="${DATABASE_NAME}"` |
| **User approval** | Not required | **Required** |

---

### Legacy Workflow (Phase 1 Simple Version)

```bash
# 1. Directly add base data to test DB (using psql or Sonamu UI)
PGPASSWORD=1234 psql -h 0.0.0.0 -U postgres -d project_test

# 2. Generate dump
pnpm dump

# 3. Apply to fixture DB
pnpm seed

# 4. (Optional) sonamu fixture sync
pnpm sonamu fixture sync
```

### Position for Adding Seed Data in Dump File

**pg_dump --inserts output order (based on miomock):**

```sql
-- 1~40: SET statements & Extensions
SET statement_timeout = 0;
CREATE EXTENSION IF NOT EXISTS ...;

-- ~400: CREATE TABLE
CREATE TABLE public.companies (...);
CREATE TABLE public.departments (...);

-- ~450: CREATE SEQUENCE
CREATE SEQUENCE public.companies_id_seq ...;

-- ~470: ALTER SEQUENCE OWNED BY
ALTER SEQUENCE public.companies_id_seq OWNED BY public.companies.id;

-- 480~564: ALTER TABLE ... DEFAULT (Name: xxx id; Type: DEFAULT)
ALTER TABLE ONLY public.companies ALTER COLUMN id SET DEFAULT nextval(...);

-- ⭐ 574~1770: INSERT INTO ... ← SEED DATA INSERTION POSITION
INSERT INTO public.companies VALUES (1, '2025-11-25 00:17:02+09', 'Tech Corp');
INSERT INTO public.departments VALUES (1, '2024-01-01 01:00:00+09', 'Dev Team', 1, NULL, DEFAULT);
INSERT INTO public.employees VALUES (1, '2024-01-01 01:00:00+09', 1, 3, 'EMP001', 75000.00, ...);

-- 1775~1862: SELECT pg_catalog.setval (Name: xxx_id_seq; Type: SEQUENCE SET)
SELECT pg_catalog.setval('public.companies_id_seq', 308, true);

-- 1878~2006: ALTER TABLE ... PRIMARY KEY
ALTER TABLE ONLY public.companies ADD CONSTRAINT companies_pkey PRIMARY KEY (id);

-- 2010~2017: CREATE INDEX
CREATE INDEX projects_name_description_pgroonga_index ON public.projects ...;

-- 2024~: ALTER TABLE ... FOREIGN KEY (FK constraint - data must exist before this!)
ALTER TABLE ONLY public.departments 
    ADD CONSTRAINT departments_company_id_foreign FOREIGN KEY (company_id) REFERENCES public.companies(id);
```

### CRITICAL: Seed Data Placement Rule

**Seed data must be added before FK CONSTRAINTs.**

| Position | Result |
|----------|--------|
| Before FK CONSTRAINT | OK - FK check after data insertion |
| After FK CONSTRAINT | FAIL - FK violation because referenced table has no data |

### Table Dependency Order

Seed data INSERT order must follow **FK dependencies**:

```sql
-- 1. Independent tables first (tables without FKs)
INSERT INTO public.institutions (id, name, code) VALUES (1, 'Headquarters', 'HQ');

-- 2. Tables referencing step 1
INSERT INTO public.departments (id, name, institution_id) VALUES (1, 'Research', 1);

-- 3. Tables referencing steps 1 and 2
INSERT INTO public.users (id, name, institution_id, department_id) VALUES (1, 'Admin', 1, 1);
```

### Setting Sequence Values

After adding seed data, the sequence current values must also be updated:

```sql
-- Set sequence to after the maximum id in seed data
SELECT pg_catalog.setval('public.users_id_seq', 10, true);  -- next id starts from 11
SELECT pg_catalog.setval('public.departments_id_seq', 5, true);
```

### Example: Minimal Seed Data

```sql
-- institutions (independent)
INSERT INTO public.institutions (id, created_at, name, code) VALUES 
  (1, '2024-01-01 00:00:00+09', 'Headquarters', 'HQ');

-- departments (references institutions)
INSERT INTO public.departments (id, created_at, name, code, institution_id, is_active) VALUES 
  (1, '2024-01-01 00:00:00+09', 'Research', 'RND', 1, true);

-- Set sequences
SELECT pg_catalog.setval('public.institutions_id_seq', 1, true);
SELECT pg_catalog.setval('public.departments_id_seq', 1, true);
```

---

## Resolving Port Conflicts

If a port-already-in-use error occurs when running `pnpm docker:up`:

### Step 1: Check Running Containers

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

### Step 2: Compare Container Names

**Check the current project's container name:**
```bash
# Check CONTAINER_NAME in packages/api/.env
cat packages/api/.env | grep CONTAINER_NAME
```

### Step 3: Handle by Situation

#### If Container Names are the Same

A container from the same project was started earlier. Bring it down and bring it back up:

```bash
cd packages/api
pnpm docker:down
pnpm docker:up
```

#### If Container Names are Different

Another project is using the same port. The new project's port must be changed.

**Two files to modify:**

1. `packages/api/.env`
```bash
# Before
DB_PORT=5432

# After (use an unused port between 5433–5439)
DB_PORT=5433
```

2. `packages/api/database/docker-compose.yml`
```yaml
# Before
ports:
  - "5432:5432"

# After
ports:
  - "5433:5432"
```

3. `packages/api/src/sonamu.config.ts`
```typescript
// Before
port: 5432,

// After
port: 5433,
```

**Port Selection Guide:**
- PostgreSQL default port: 5432
- Available range: 5433 ~ 5439
- Check currently used ports with `docker ps` and choose a number that is not duplicated

### Restart After Changes

```bash
pnpm docker:up
```

## DB Connection Configuration Files

| File | Purpose |
|------|---------|
| `packages/api/.env` | Environment variables (DB_HOST, DB_PORT, DB_USER, etc.) |
| `packages/api/database/docker-compose.yml` | Docker container configuration |
| `packages/api/src/sonamu.config.ts` | Sonamu DB connection configuration |

## .env Default Settings

```bash
DB_HOST=0.0.0.0
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=1234
CONTAINER_NAME=[project-name]-container
DATABASE_NAME=[project-name]
```
