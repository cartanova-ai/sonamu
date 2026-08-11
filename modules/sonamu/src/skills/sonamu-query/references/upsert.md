# Upsert and Persistence: Save, Relations, and Batches

## Generated save baseline

The generated types file derives a write schema from `BaseSchema`, omits generated/search-text
columns, and makes `id` plus `created_at` (when present) optional. Extend that schema for relation-ID
arrays or other API inputs; keep the exported inferred type as the Model contract.

```typescript
export const ProjectSaveParams = ProjectBaseSchema.omit({ search_text: true }).partial({
  id: true,
  created_at: true,
}).extend({
  member_ids: z.array(z.number().int().positive()),
});
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;
```

The ordinary Model save buffers rows, then flushes them through the same wrapper in a transaction:

```typescript
@api({ httpMethod: "POST", clients: ["axios", "tanstack-mutation"] })
async save(spa: UserSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");
  for (const sp of spa) wdb.ubRegister("users", sp);

  return wdb.transaction((trx) => trx.ubUpsert("users"));
}
```

`ubRegister()` mutates the wrapper's `UpsertBuilder` and returns a `UBRef`. The transaction wrapper
shares that builder, so rows registered before the callback are visible to `trx.ubUpsert()`.
`ubUpsert()` returns IDs in flush processing order and clears the buffered rows for that table after
a successful flush. Without self-references this follows registration order; self-references are
returned in dependency-level order.

## Upsert behavior

UpsertBuilder performs these steps:

1. EntityManager table metadata supplies unique indexes and JSON columns.
2. Registered JSON values are serialized. A `UBRef.use` defaults to `"id"`.
3. Rows without `id` are looked up by each non-null unique-index value; a match fills the existing
   ID.
4. The final statement inserts the rows and uses `ON CONFLICT (id) DO UPDATE`.

This is convenient batch identity resolution, but it is not a single atomic natural-key upsert. If
concurrent writers must arbitrate on a unique or composite key, use direct Puri conflict targeting:

```typescript
await this.getPuri("w")
  .table("user_settings")
  .insert({ user_id: userId, key, value })
  .onConflict(["user_id", "key"], { update: ["value"] });
```

### Required fields on every call, including updates

An UpsertBuilder update still executes an INSERT statement before the conflict branch. Every
required column therefore needs an input value or database default even when `id` already exists.
`inherit: ["created_at"]` removes that column from the UPDATE list; it does not make the column
optional on the INSERT path.

Registered rows should have compatible insert shapes within a flush. `ubUpdateBatch()` is the
partial-update API when only selected columns should change.

## `UBRef` order and self references

```typescript
const wdb = this.getPuri("w");
const companyRef = wdb.ubRegister("companies", { name: companyName });
wdb.ubRegister("departments", { company_id: companyRef, name: departmentName });

return wdb.transaction(async (trx) => {
  await trx.ubUpsert("companies");
  return trx.ubUpsert("departments");
});
```

Flush a referenced table first. Flushing the child while it still contains a cross-table `UBRef`
throws that the reference is unresolved. The reference is meaningful only inside buffered rows; it
is not a value for a Puri WHERE clause.

Self-references within one table are topologically split into levels and resolved by a single
`ubUpsert(table)` call. A missing target UUID or circular self-reference throws before the table can
be fully flushed.

## Replacing many-to-many relations

UpsertBuilder does not infer relation replacement from a parent `SaveParams`. Register the parent
and junction rows, flush in FK order, then delete old junction rows not returned by this save:

```typescript
async save(spa: ProjectSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");

  for (const { member_ids, ...project } of spa) {
    const projectRef = wdb.ubRegister("projects", project);
    for (const memberId of member_ids) {
      wdb.ubRegister("project_members", {
        project_id: projectRef,
        member_id: memberId,
      });
    }
  }

  return wdb.transaction(async (trx) => {
    const projectIds = await trx.ubUpsert("projects");
    const relationIds = await trx.ubUpsert("project_members");

    await trx
      .table("project_members")
      .whereIn("project_members.project_id", projectIds)
      .whereNotIn("project_members.id", relationIds)
      .delete();

    return projectIds;
  });
}
```

If every `member_ids` array is empty, `ubUpsert("project_members")` returns `[]` and the explicit
delete removes all junction rows for the saved parents. Keeping registration and cleanup in the
same transaction prevents a partially replaced relation set.

When destructuring relation arrays, retain the concrete SaveParams type. Casting the input to `any`
also makes the remaining database column object `any`, so misspelled columns reach runtime.

## `cleanOrphans`

`cleanOrphans` performs post-upsert cleanup for the FK values present in the registered rows:

```typescript
await trx.ubUpsert("order_items", { cleanOrphans: "order_id" });
```

After the upsert it collects each named FK column's non-empty value set, deletes rows whose FK is in
each set, and excludes the IDs just returned. With multiple columns, those independent `WHERE IN`
sets are combined with AND; they are not matched as an array of FK tuples.

Cleanup is skipped unless every named FK column has at least one collected value. If no child row
was registered, `ubUpsert()` returns before cleanup, so `cleanOrphans` cannot clear an empty
replacement set. Use the explicit junction/child delete pattern above when an empty array means
"remove all".

## Batch operations

### Insert only

```typescript
const wdb = this.getPuri("w");
for (const row of rows) wdb.ubRegister("audit_logs", row);

const ids = await wdb.transaction((trx) =>
  trx.ubInsertOnly("audit_logs", { chunkSize: 1000 }),
);
```

`ubInsertOnly()` performs INSERT with RETURNING and does not handle conflicts. Duplicate unique
values surface as database errors. `chunkSize` splits statements; the surrounding transaction is
what makes all chunks atomic.

### Batch partial update

```typescript
for (const row of rows) {
  wdb.ubRegister("users", { id: row.id, status: row.status });
}

await wdb.transaction((trx) =>
  trx.ubUpdateBatch("users", { chunkSize: 500, where: "id" }),
);
```

`ubUpdateBatch()` updates only the registered columns. `where` defaults to `"id"` and also accepts
an array such as `["tenant_id", "external_id"]` for composite matching. It returns `void` and clears
the processed buffer.

### Conditional mode

```typescript
await trx.ubUpsertOrInsert("users", "upsert", { inherit: ["created_at"] });
await trx.ubUpsertOrInsert("audit_logs", "insert", { chunkSize: 1000 });
```

`ubUpsertOrInsert()` selects the UpsertBuilder branch at runtime. `inherit` affects only the upsert
branch. `cleanOrphans` runs after either branch when its FK-value preconditions are satisfied.

## Direct Puri writes

Use direct Puri when the operation is already a single statement or needs an explicit conflict
target:

```typescript
const inserted = await wdb.table("users").insert(row).returning(["id", "created_at"]);
await wdb.table("users").where("users.id", id).update({ status: "active" });
await wdb.table("users").whereIn("users.id", ids).delete();
```

`insert()`/`update()` serialize generated JSON columns in place, so do not reuse the same input
object expecting its JSON properties to remain objects. Direct `onConflict()` supports `"nothing"`,
an update-column array, or an update object. Puri does not enforce a WHERE clause for `update()` or
`delete()`; without one, PostgreSQL applies the operation to every row in the table.
