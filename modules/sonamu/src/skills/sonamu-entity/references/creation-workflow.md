# Entity Creation Workflow

## Entity Creation Workflow

**Prerequisite: CRITICAL!**

**Always run `pnpm dev` in `/packages/api` before starting!**

```bash
cd packages/api
pnpm dev  # keep this running during all work
```

> **Why**: In dev mode, the syncer detects changes to entity.json and auto-generates types.ts.
>
> Dev mode is required **for all entity creation**, not just auth entities.

### Step 1: Generate stub

**CRITICAL: EntityId must always start with an uppercase letter!**

```bash
pnpm sonamu stub entity {EntityId}
```

**Correct examples:**

- `pnpm sonamu stub entity Course` (correct)
- `pnpm sonamu stub entity User` (correct)
- `pnpm sonamu stub entity ConsultationHistory` (correct)

**Incorrect examples:**

- `pnpm sonamu stub entity course` (wrong — starts with lowercase)
- `pnpm gen stub entity Course` (wrong — incorrect command)

Generated file: `api/src/application/{entity}/{entity}.entity.json`

### Step 2: Edit the stub file

Add props, relations, and subsets to the generated entity.json file.

### Step 3: Validate and generate required files

**CRITICAL: Always validate before running sync!**

**A. Validate entity.json** (see PHASE 1 below)

- [ ] Does every index have a `type` field?
- [ ] Does the subset use `relation.id` format instead of directly referencing FK columns?
- [ ] Is the Boolean `dbDefault` a string (`"true"` / `"false"`)?
- [ ] Does the OrderBy enum contain only `id-desc`?
- [ ] Is the Enum `dbDefault` using escaped double quotes? (e.g., `"\"pending\""`)

**B. model.ts (must be created manually)**

- Must be created manually
- Reference another entity's model.ts as a template
- Required methods: findById, findOne, findMany, save, del
- See PHASE 2 below for template

**C. types.ts (auto-generated — wait for it)**

- **If `pnpm dev` is running**, the syncer will auto-generate it within 2–3 seconds
- Check: `ls packages/api/src/application/{entity}/{entity}.types.ts`
- If not generated:
  1. Verify `pnpm dev` is running
  2. If still not generated, create manually (see PHASE 2 below for template)

**Done criteria:**

- [ ] entity.json validation passed
- [ ] model.ts exists
- [ ] types.ts exists (auto-generated or manually created)

### Step 4: Sync

```bash
pnpm sonamu sync
```

**Note:** Do not write entity JSON by hand. Always generate using the stub command, then edit.

### Step 5: Migration and Scaffolding

1. Generate and apply migration
2. Run scaffolding
3. Test the build

**Full workflow:** see the step-by-step checklist in PHASE 1–5 below

### Step 6: Handle nullable fields in types.ts (required)

**CRITICAL: Do this immediately after scaffolding, before writing tests!**

After scaffolding completes, nullable fields in the generated `*.types.ts` must be handled.

```typescript
// Auto-generated types.ts
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
});

// CORRECT: update immediately — add nullable fields
export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  category: true, // nullable added
  order_num: true, // nullable added
}).extend({
  category: z.string().nullish(),
  order_num: z.number().nullish(),
  updated_at: z.date().nullish(),
});
```

**Detailed guide:** see "Tasks to Do Immediately After Entity Creation" in `sonamu-testing`


## Overall Workflow

```
1. Generate stub
2. Write entity.json
3. Run automated validation (this checklist)
4. Create model.ts, types.ts
5. Run sync
6. Create migration
7. Apply migration
8. Run scaffolding
```

## PHASE 1: entity.json Validation (Before Sync)

Immediately after writing your entity.json file, validate the following **before running sync**.

### 1.1 Index Validation

**Does every index have a `type` field?**

```json
// DO NOT - Incorrect
"indexes": [
  { "name": "ix_user_email", "columns": [{ "name": "email" }] }
]

// DO - Correct
"indexes": [
  { "name": "ix_user_email", "type": "index", "columns": [{ "name": "email" }] }
]
```

**How to validate:**

```bash
# Find indexes without type in all entity.json files
grep -r '"indexes"' packages/api/src/application/*/\*.entity.json | \
  xargs -I {} sh -c 'grep -L "\"type\":" {}'
```

### 1.2 Subset Validation

**Are you avoiding direct foreign key references?**

```json
// DO NOT - Incorrect: direct foreign key reference
"subsets": {
  "A": ["id", "user_id", "task_id"]
}

// DO - Correct: reference through relation (Sonamu auto-optimizes when only .id is referenced)
"subsets": {
  "A": ["id", "user.id", "task.id"]
}
```

**Rules:**

- `{relation_name}_id` → `{relation_name}.id`
- If a BelongsToOne relation exists, always use `relation.id` format
- Sonamu optimizes by reading the FK column directly and skipping JOINs when only `.id` is referenced

**How to validate:**

```bash
# Find subset fields ending in _id in entity.json
grep -A 20 '"subsets"' your-entity.entity.json | grep '_id"'
```

**Reference working code:**

- `sonamu/examples/miomock/api/src/application/project/project.entity.json`
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json`

### 1.3 Subset A Completeness Validation

**Does Subset A include all fields?**

```json
// DO - Correct: all props included
{
  "props": [
    { "name": "id" },
    { "name": "created_at" },
    { "name": "title" },
    { "type": "relation", "name": "user" }
  ],
  "subsets": {
    "A": ["id", "created_at", "title", "user.id", "user.name"]
  }
}
```

**Validation checklist:**

- [ ] All regular fields included
- [ ] All relations include at least `.id`
- [ ] Non-nullable relations also include required fields

### 1.4 Duplicate Column Validation

**Are BelongsToOne relations and their foreign keys not defined twice?**

```json
// DO NOT - Incorrect: duplicate definition
{
  "props": [
    { "name": "user_id", "type": "integer" },  // should be removed
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ]
}

// DO - Correct: define relation only
{
  "props": [
    {
      "type": "relation",
      "name": "user",
      "with": "User",
      "relationType": "BelongsToOne"
    }
  ]
}
```

**How to validate:**

```bash
# Check if a BelongsToOne relation also has an _id field
grep -A 5 '"relationType": "BelongsToOne"' your-entity.entity.json
grep '"name": ".*_id"' your-entity.entity.json
```

### 1.5 Boolean dbDefault Validation

**Is the dbDefault for Boolean types the string "true"/"false"?**

```json
// DO NOT - Incorrect
{ "name": "is_active", "type": "boolean", "dbDefault": "1" }
{ "name": "is_deleted", "type": "boolean", "dbDefault": "0" }

// DO - Correct
{ "name": "is_active", "type": "boolean", "dbDefault": "true" }
{ "name": "is_deleted", "type": "boolean", "dbDefault": "false" }
```

### 1.6 OrderBy Enum Validation

**Does the OrderBy enum contain only `id-desc`?**

```json
// DO NOT - Incorrect: causes scaffolding errors!
"enums": {
  "ProductOrderBy": {
    "id-desc": "ID Latest",
    "name-asc": "By Name",
    "created_at-desc": "By Registration Date"
  }
}

// DO - Correct
"enums": {
  "ProductOrderBy": { "id-desc": "ID Latest" }
}
```

**Reason:** The model code generated by scaffolding only handles `id-desc`.

### 1.7 Enum dbDefault Validation

**Is the dbDefault for Enum types wrapped in escaped double quotes?**

```json
// DO NOT - Incorrect
{ "name": "status", "type": "enum", "id": "Status", "dbDefault": "pending" }
{ "name": "status", "type": "enum", "id": "Status", "dbDefault": "'pending'" }

// DO - Correct
{ "name": "status", "type": "enum", "id": "Status", "dbDefault": "\"pending\"" }
```

## PHASE 2: Required File Generation Validation

### 2.1 model.ts File Creation

**Does the entity folder contain a `{entity}.model.ts` file?**

```bash
# Check
ls packages/api/src/application/your-entity/your-entity.model.ts
```

**If missing, manual creation is required** (refer to another entity's model.ts)

Required methods:

- `findById`
- `findOne`
- `findMany`
- `save`
- `del`

### 2.2 types.ts File Creation

**Does the entity folder contain a `{entity}.types.ts` file?**

```bash
# Check
ls packages/api/src/application/your-entity/your-entity.types.ts
```

**Required content:**

```typescript
import { z } from "zod";
import { YourEntityBaseListParams, YourEntityBaseSchema } from "../sonamu.generated";

export const YourEntityListParams = YourEntityBaseListParams;
export type YourEntityListParams = z.infer<typeof YourEntityListParams>;

// Basic pattern (no relations)
export const YourEntitySaveParams = YourEntityBaseSchema.partial({
  id: true,
  created_at: true,
});
export type YourEntitySaveParams = z.infer<typeof YourEntitySaveParams>;
```

**If a ManyToMany relation exists:**

```typescript
// ManyToMany relation: add {relation_name}_ids array
export const YourEntitySaveParams = YourEntityBaseSchema.partial({
  id: true,
  created_at: true,
}).extend({
  relation_name_ids: z.array(z.number().int().positive()),
});
export type YourEntitySaveParams = z.infer<typeof YourEntitySaveParams>;
```

**Reference working code:**

- `sonamu/examples/miomock/api/src/application/project/project.types.ts` - ManyToMany example
- `sonamu/examples/miomock/api/src/application/employee/employee.types.ts` - basic pattern

## PHASE 3: Sync Execution and Validation

### 3.1 Run Sync

```bash
cd packages/api
pnpm sonamu sync
```

### 3.2 Sync Result Validation

**Are all 3 files registered in sonamu.lock?**

```bash
# Check
grep "your-entity" packages/api/sonamu.lock
```

**Expected result:**

```json
[
  {
    "path": "src/application/your-entity/your-entity.entity.json",
    "checksum": "..."
  },
  {
    "path": "src/application/your-entity/your-entity.model.ts",
    "checksum": "..."
  },
  {
    "path": "src/application/your-entity/your-entity.types.ts",
    "checksum": "..."
  }
]
```

### 3.3 Web Package Sync Validation

**Have the required files been generated in the web package?**

```bash
# Check service generation
grep "YourEntityService" packages/web/src/services/services.generated.ts

# Check component generation
ls packages/web/src/components/your-entity/

# Check route generation
ls packages/web/src/routes/admin/your-entities/
```

### 3.4 i18n Key Generation Validation

**Have labels been generated for foreign key fields?**

```bash
# Check
grep "entity.YourEntity" packages/web/src/i18n/sd.generated.ts
```

## PHASE 4: Migration Validation

### 4.1 Create Migration File

```bash
cd packages/api
pnpm sonamu migration:create
```

### 4.2 Migration File Validation

**Check the generated migration file:**

```bash
ls packages/api/src/migrations/*_create__your_entities.ts
```

**Validation checklist:**

- [ ] Is the table name correct? (plural, snake_case)
- [ ] Are all columns defined?
- [ ] Are foreign key constraints present?
- [ ] Are indexes created?
- [ ] Is the default for Boolean columns correct? (true/false)

### 4.3 Migration Dry-run

```bash
# Check SQL before applying migration
cd packages/api
pnpm sonamu migration:latest --dry-run
```

**Check for:**

- No SQL syntax errors
- No duplicate column definitions
- No Boolean default type errors

## PHASE 5: Scaffolding Validation

### 5.1 Pre-Scaffolding Check

**Have all previous steps been completed?**

- [ ] entity.json validation complete
- [ ] model.ts, types.ts created
- [ ] sync executed
- [ ] migration created and applied

### 5.2 Run Scaffolding

```bash
cd packages/api
pnpm sonamu scaffold your-entity
```

### 5.3 Build Validation

```bash
# API build
cd packages/api
pnpm build

# Web build
cd packages/web
pnpm build
```

**There must be no build errors!**

## Automated Validation Script (Optional)

Save the following script as `packages/api/scripts/validate-entity.sh`:

```bash
#!/bin/bash

ENTITY=$1
ENTITY_DIR="src/application/$ENTITY"

echo "[VALIDATION] Validating entity: $ENTITY"

# 1. Check files exist
echo "[CHECK] Checking required files..."
if [ ! -f "$ENTITY_DIR/$ENTITY.entity.json" ]; then
  echo "[ERROR] Missing: $ENTITY.entity.json"
  exit 1
fi
if [ ! -f "$ENTITY_DIR/$ENTITY.model.ts" ]; then
  echo "[ERROR] Missing: $ENTITY.model.ts"
  exit 1
fi
if [ ! -f "$ENTITY_DIR/$ENTITY.types.ts" ]; then
  echo "[ERROR] Missing: $ENTITY.types.ts"
  exit 1
fi
echo "[PASS] All required files exist"

# 2. Check indexes have type
echo "[CHECK] Checking index types..."
if grep -q '"indexes"' "$ENTITY_DIR/$ENTITY.entity.json"; then
  if ! grep -A 10 '"indexes"' "$ENTITY_DIR/$ENTITY.entity.json" | grep -q '"type":'; then
    echo "[ERROR] Some indexes are missing 'type' field"
    exit 1
  fi
fi
echo "[PASS] All indexes have type"

# 3. Check for _id in subsets
echo "[CHECK] Checking subset field expressions..."
if grep -A 20 '"subsets"' "$ENTITY_DIR/$ENTITY.entity.json" | grep -q '_id"'; then
  echo "[WARNING] Found '_id' in subsets. Should use 'relation.id' instead"
fi

# 4. Check OrderBy enum
echo "[CHECK] Checking OrderBy enum..."
if grep -A 5 'OrderBy"' "$ENTITY_DIR/$ENTITY.entity.json" | grep -v 'id-desc' | grep -q ':'; then
  echo "[WARNING] OrderBy has values other than 'id-desc'"
fi

echo "[COMPLETE] Entity validation complete!"
```

**Usage:**

```bash
chmod +x packages/api/scripts/validate-entity.sh
./packages/api/scripts/validate-entity.sh your-entity
```

## Checklist Summary

When creating an entity, **always** proceed in the following order:

1. STEP 1: `pnpm sonamu stub entity YourEntity`
2. STEP 2: Write `your-entity.entity.json`
3. STEP 3: **Validate using this checklist** (CRITICAL - must be performed)
4. STEP 4: Create `your-entity.model.ts`
5. STEP 5: Create `your-entity.types.ts`
6. STEP 6: `pnpm sonamu sync`
7. STEP 7: Validate sync results (sonamu.lock, web files)
8. STEP 8: `pnpm sonamu migration:create`
9. STEP 9: Validate migration file
10. STEP 10: `pnpm sonamu migration:latest` (apply)
11. STEP 11: `pnpm sonamu scaffold your-entity`
12. STEP 12: Build test
