# Relationship Details — FK Rules, Subsets, ManyToMany Types

## FK Reference Rules (FieldExpr)

When a BelongsToOne relationship is defined, a `{name}_id` column is automatically created. **In subsets, reference using the `{name}.id` form (FieldExpr)**, and **in indexes, use the actual DB column name (`{name}_id`)**.

### Where It Applies

| Location | Format                       | Example               |
| -------- | ---------------------------- | --------------------- |
| subsets  | FieldExpr (`relation.field`) | `"user.id"`           |
| indexes  | actual DB column name        | `"user_id"`           |
| unique   | actual DB column name        | `["user_id", "date"]` |
| search   | FieldExpr (`relation.field`) | `"user.id"`           |

### Example

```json
{
  "id": "ApiLog",
  "props": [{ "type": "relation", "name": "user", "with": "User", "relationType": "BelongsToOne" }],
  "subsets": {
    "A": ["id", "user.id", "api_path"] // use FieldExpr
  },
  "indexes": [
    {
      "type": "index",
      "name": "api_logs_user_id_index",
      "columns": [{ "name": "user_id" }]
    }
  ]
}
```

### Error Message in Subsets

```
Error: ApiLog -- invalid FieldExpr 'user_id' (available props: id, created_at, ..., user)
```

If you see this error in subsets, change `user_id` → `user.id`. In indexes, `user_id` is the correct format.

> **Note:** For a detailed explanation of the difference in reference methods between indexes and subsets, see the "IMPORTANT: In indexes, use the actual DB column name for FK columns" section in `sonamu-entity`.

---

## Common Mistakes

| Mistake                                       | Fix                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Using a separate `"relations": [...]` section | Define with `"type": "relation"` inside `props`                                              |
| Directly defining `{name}_id` in BelongsToOne | Delete it (auto-generated)                                                                   |
| Using `user_id` directly in Subset            | Change to `user.id` form                                                                     |
| Mismatch of FK intent in OneToOne             | Explicitly set `hasJoinColumn: true` on the side holding the FK (optional, no FK if omitted) |
| Missing `joinColumn` in HasMany               | Specify the FK column name in the related table                                              |
| Missing `onUpdate/onDelete` in ManyToMany     | Add as required                                                                              |
| Inconsistent joinTable name                   | Consistent naming recommended (alphabetical order)                                           |
| `nullable: false` in self-reference           | Change to `nullable: true`                                                                   |

## Using Relationships in Subsets

- See `references/subset.md`

```json
{
  "subsets": {
    "A": ["id", "title", "author.id", "author.username", "author.department.name"]
  }
}
```

- Nesting is possible via dot notation
- JOIN is auto-generated

---

## Type Definitions for ManyToMany Relationships

ManyToMany relationships are defined in Entity JSON, but SaveParams must pass join table data as an array.

Reference: sonamu/examples/miomock/api/src/application/project

### Handling ManyToMany in SaveParams

**Pattern: Use BaseSchema.partial().extend()**

```typescript
// project.types.ts (miomock example)
import { z } from "zod";
import { ProjectBaseSchema } from "../sonamu.generated";

export const ProjectSaveParams = ProjectBaseSchema.partial({
  id: true,
  created_at: true,
})
  .extend({
    employee_ids: z.array(z.number().int().positive()), // ManyToMany: employee
    tag_ids: z.array(z.number().int().positive()), // ManyToMany: tags
  })
  .omit({
    virtual_test: true, // remove virtual fields
    virtual_query_test: true,
    textsearchable_index_col: true, // remove generated fields
  });
export type ProjectSaveParams = z.infer<typeof ProjectSaveParams>;
```

**Important:**

- Since BaseSchema does not have ManyToMany relation fields, add them with `.extend()`
- Field name should be in the `{relation_name}_ids` form (e.g. employee → employee_ids, tags → tag_ids)
- Type validation: `z.array(z.number().int().positive())` - only positive integers allowed
- Remove virtual/generated fields with `.omit()`
- Bidirectional ManyToMany is managed from one side only (Project only, not Employee)

### Handling in Model.save() (Recommended Pattern)

**Efficient pattern: Delete only changed entries with whereNotIn**

```typescript
// project.model.ts (miomock example)
async save(spa: ProjectSaveParams[]): Promise<number[]> {
  const puri = this.getPuri("w");

  // register
  spa.forEach(({ employee_ids, tag_ids, ...sp }) => {
    const project_id = puri.ubRegister("projects", sp);

    employee_ids.forEach((employee_id) => {
      puri.ubRegister("projects__employees", {
        project_id,
        employee_id,
      });
    });

    tag_ids.forEach((tag_id) => {
      puri.ubRegister("project_tags", {
        project_id,
        tag_id,
      });
    });
  });

  return puri.transaction(async (trx) => {
    const ids = await trx.ubUpsert("projects");
    const peIds = await trx.ubUpsert("projects__employees");
    const ptIds = await trx.ubUpsert("project_tags");

    // Key: delete only relationships not in the current request with whereNotIn (efficient)
    await trx
      .table("projects__employees")
      .whereIn("project_id", ids)
      .whereNotIn("id", peIds)  // delete only those not in ubUpsert result
      .delete();

    await trx
      .table("project_tags")
      .whereIn("project_id", ids)
      .whereNotIn("id", ptIds)
      .delete();

    return ids;
  });
}
```

**Basic pattern: Delete all then re-register (simple but inefficient)**

```typescript
async save(spa: QuestionCollectionSaveParams[]): Promise<number[]> {
  const wdb = this.getPuri("w");

  const categoryIdsList: (number[] | undefined)[] = [];
  spa.forEach((sp) => {
    const { category_ids, ...collectionData } = sp as QuestionCollectionSaveParams;
    categoryIdsList.push(category_ids);
    wdb.ubRegister("question_collections", collectionData);
  });

  return wdb.transaction(async (trx) => {
    const ids = await trx.ubUpsert("question_collections");

    // Delete all (inefficient but simple)
    await trx
      .table("question_collections__survey_categories")
      .whereIn("question_collection_id", ids)
      .delete();

    // Register new relationships
    ids.forEach((collectionId, index) => {
      const categoryIds = categoryIdsList[index];
      if (categoryIds && categoryIds.length > 0) {
        categoryIds.forEach((categoryId) => {
          trx.ubRegister("question_collections__survey_categories", {
            question_collection_id: collectionId,
            survey_category_id: categoryId,
          });
        });
      }
    });

    await trx.ubUpsert("question_collections__survey_categories");
    return ids;
  });
}
```

### Notes on Update

When re-saving data queried in an update test, ManyToMany relationship fields must be provided again:

```typescript
// WRONG - saving without category_ids will delete all relationships
const { categories, ...collectionData } = collection;
await QuestionCollectionModel.save([{ ...collectionData, title: "Updated Title" }]);

// CORRECT - extract ids from categories and pass them
const { categories, ...collectionData } = collection;
const category_ids = categories?.map((c) => c.id) ?? [];
await QuestionCollectionModel.save([{ ...collectionData, category_ids, title: "Updated Title" }]);
```

### Managing Bidirectional ManyToMany

**Principle: Manage from one side only**

```typescript
// Project Entity: employee (ManyToMany)
// Employee Entity: projs (ManyToMany, same join table)

// project.types.ts - manages employee_ids
export const ProjectSaveParams = ProjectBaseSchema.extend({
  employee_ids: z.array(z.number().int().positive()),
});

// employee.types.ts - does not manage proj_ids
export const EmployeeSaveParams = EmployeeBaseSchema.partial({ id: true, created_at: true });
// proj_ids is not added
```

**Reason:**

- Managing from both sides causes synchronization issues
- Managing from the primary Entity (Project) only is clearer
- When querying Employee, projs are automatically joined and returned
