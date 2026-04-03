---
name: sonamu-upsert
description: Saving complex relational data with Sonamu UpsertBuilder. ubRegister, ubUpsert, insertOnly, updateBatch patterns, FK ordering, cleanOrphans. Use when saving related data with foreign key dependencies.
---

# UpsertBuilder

## UBRef Type

The reference object returned by `ubRegister()`:

```typescript
type UBRef = {
  uuid: string;   // unique identifier
  of: string;     // table name
  use?: string;   // field to reference (default: "id")
};
```

## Basic Pattern

```typescript
const wdb = this.getPuri("w");

// Register data (returns UBRef)
const userRef = wdb.ubRegister("users", { email: "john@test.com", username: "john" });

// Use UBRef in related data
wdb.ubRegister("employees", { user_id: userRef, department_id: deptId });

// Save in order inside a transaction
return wdb.transaction(async (trx) => {
  await trx.ubUpsert("users");       // Save first (referenced by FK)
  return trx.ubUpsert("employees");  // Save after (uses FK)
});
```

## CRITICAL: All Required Fields Must Be Included

**ubUpsert uses PostgreSQL's `ON CONFLICT ... DO UPDATE` query.**

Even when updating, **all required fields (fields with NOT NULL constraints)** must be included.

```typescript
// BAD - missing required field
wdb.ubRegister("posts", {
  id: 1,
  title: "Updated Title",
  // content required field missing! → ON CONFLICT UPDATE tries to set NULL → DB error
});
// Error: null value in column "content" violates not-null constraint

// GOOD - all required fields included
wdb.ubRegister("posts", {
  id: 1,
  title: "Updated Title",
  content: "Updated Content",  // required field included!
  author_id: 1,                // FK also included if required!
});
```

**How to identify required fields**:
1. Check props in entity.json
2. Fields without `nullable: true` = required fields
3. `id`, `created_at`, fields with `dbDefault` can be omitted

```json
// entity.json example
{
  "props": [
    { "name": "id", "type": "integer" },  // can be omitted
    { "name": "title", "type": "string" },  // required! (no nullable)
    { "name": "content", "type": "string" },  // required! (no nullable)
    { "name": "category", "type": "string", "nullable": true },  // optional
    { "name": "created_at", "type": "date", "dbDefault": "CURRENT_TIMESTAMP" }  // can be omitted
  ]
}
```

## Save Order (Important!)

Save the table referenced by FK first:

```typescript
await trx.ubUpsert("companies");   // 1. No dependencies
await trx.ubUpsert("departments"); // 2. Needs company_id
await trx.ubUpsert("users");       // 3. No dependencies
await trx.ubUpsert("employees");   // 4. Needs user_id, department_id
```

## Model save Pattern

```typescript
@api({ httpMethod: "POST" })
async save(spa: UserSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");
  spa.forEach((sp) => wdb.ubRegister("users", sp));

  return wdb.transaction(async (trx) => {
    return trx.ubUpsert("users");
  });
}
```

## Saving Related Data

```typescript
await this.getPuri("w").transaction(async (trx) => {
  // Register User
  const userRef = trx.ubRegister("users", {
    email: data.email,
    username: data.username,
    password: bcrypt.hashSync(data.password, 10),
  });

  // Register Employee (using userRef)
  trx.ubRegister("employees", {
    user_id: userRef,
    department_id: data.departmentId,
    salary: data.salary,
  });

  // Save in order
  await trx.ubUpsert("users");
  const [employeeId] = await trx.ubUpsert("employees");
  return employeeId;
});
```

## Upsert (Insert or Update)

```typescript
// INSERT when no id
wdb.ubRegister("users", { email: "new@test.com", username: "new" });

// UPDATE when id is present
wdb.ubRegister("users", { id: 1, email: "updated@test.com" });
```

**Conflict handling**: If the Entity has a unique index, automatically pre-fetches to populate the existing record's id, then performs UPDATE

## ManyToMany Relationships

```typescript
await wdb.transaction(async (trx) => {
  const projectRef = trx.ubRegister("projects", { name: "Project A" });

  for (const empId of employeeIds) {
    trx.ubRegister("projects__employees", {
      project_id: projectRef,
      employee_id: empId,
    });
  }

  await trx.ubUpsert("projects");
  await trx.ubUpsert("projects__employees");
});
```

## Self-Reference

In hierarchical structures (e.g. categories, org charts), self-referential relationships are automatically processed level by level:

```typescript
await wdb.transaction(async (trx) => {
  // Root category
  const rootRef = trx.ubRegister("categories", { name: "Root", parent_id: null });
  
  // Child category (references rootRef)
  const childRef = trx.ubRegister("categories", { name: "Child", parent_id: rootRef });
  
  // Grandchild category (references childRef)
  trx.ubRegister("categories", { name: "Grandchild", parent_id: childRef });

  // Internally processed level by level (Root → Child → Grandchild)
  await trx.ubUpsert("categories");
});
```

## insertOnly (INSERT Only)

Perform INSERT without UPDATE:

```typescript
await trx.insertOnly("logs", { chunkSize: 1000 });
```

## updateBatch (Batch Update)

Bulk UPDATE operations:

```typescript
// Register multiple records
wdb.ubRegister("users", { id: 1, status: "active" });
wdb.ubRegister("users", { id: 2, status: "active" });
wdb.ubRegister("users", { id: 3, status: "inactive" });

await wdb.transaction(async (trx) => {
  await trx.updateBatch("users", {
    chunkSize: 500,      // batch size (default: 500)
    where: "id",         // WHERE condition column (default: "id")
  });
});

// Composite key for WHERE condition
await trx.updateBatch("user_settings", {
  where: ["user_id", "setting_key"],
});
```

## UpsertOptions

Options for `ubUpsert()`:

```typescript
type UpsertOptions = {
  chunkSize?: number;      // batch size
  cleanOrphans?: string | string[];  // FK column(s) to use as basis for deleting orphan records
  inherit?: string[];      // columns to preserve existing values on UPDATE
};
```

### chunkSize

Specify batch size for large data processing:

```typescript
await trx.ubUpsert("logs", { chunkSize: 1000 });
```

### cleanOrphans

Automatically delete orphan records based on FK:

```typescript
// Single FK
await trx.ubUpsert("order_items", {
  cleanOrphans: "order_id",  // delete records with the same order_id that were not upserted this time
});

// Composite FK
await trx.ubUpsert("project_members", {
  cleanOrphans: ["project_id", "team_id"],
});
```

### inherit

Preserve existing values for specific columns on UPDATE:

```typescript
await trx.ubUpsert("users", {
  inherit: ["created_at", "password"],  // these columns are excluded from UPDATE
});
```

## ubUpsertOrInsert (Conditional Mode)

Select upsert or insert mode at runtime.

```typescript
await trx.ubUpsertOrInsert("logs", "insert");   // INSERT only
await trx.ubUpsertOrInsert("users", "upsert");  // UPSERT (default)
await trx.ubUpsertOrInsert("users", "upsert", { cleanOrphans: "team_id" });
```

| Parameter | Type | Description |
|----------|------|------|
| `tableName` | string | table name |
| `mode` | `"upsert"` \| `"insert"` | operation mode |
| `options` | `UpsertOptions` | chunkSize, cleanOrphans, inherit (same as ubUpsert) |

When `mode: "insert"`, unlike `insertOnly`, `UpsertOptions` (cleanOrphans, inherit) can be used.

## Rules

- MUST use inside `transaction()`
- MUST call `ubUpsert()` for FK-referenced tables first (correct order)
- UBRef can ONLY be used inside `ubRegister` (not for direct DB queries)
- Self-reference is auto-handled by level-based insertion
- Unique index conflicts are auto-resolved by pre-fetching existing IDs
