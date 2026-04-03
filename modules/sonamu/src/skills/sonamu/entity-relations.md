---
name: sonamu-entity-relations
description: Reference for defining Sonamu Entity relationships. BelongsToOne, HasMany, OneToOne, ManyToMany configuration and common mistake prevention. Use when defining entity relationships.
---

# Entity Relationship Definitions

**Reference for working code:**
- `sonamu/examples/miomock/api/src/application/project/` - full ManyToMany relationship example
- `sonamu/examples/miomock/api/src/application/employee/` - BelongsToOne relationship example
- `sonamu/examples/miomock/api/src/application/company/` - HasMany relationship example

## Relationship Selection Guide

### 1:N vs N:M Decision Criteria

| Question | 1:N (BelongsToOne) | N:M (ManyToMany or intermediate entity) |
|------|-------------------|----------------------------------|
| Can one A belong to multiple Bs? | No | Yes |
| Does the relationship need additional information? | No | Yes → intermediate entity |
| Can it be expressed as "A belongs to B"? | Yes | No |

**Examples:**
- Post → Author: 1:N (a post has one author)
- Post ↔ Tag: N:M (multiple posts have multiple tags)
- Researcher ↔ Task: N:M + intermediate entity (participation rate, role, and other additional info)

### When an Intermediate Entity Is Needed

If an N:M relationship has **additional information**, use an **intermediate entity** instead of ManyToMany.

| Situation | ManyToMany | Intermediate entity |
|------|-----------|------------|
| Only a simple connection is needed | ✓ | |
| Relationship needs a date/period | | ✓ |
| Relationship needs a role/status | | ✓ |
| Relationship needs a quantity/ratio | | ✓ |
| Relationship history management needed | | ✓ |

**Intermediate entity example:**
```
Researcher ↔ Task
  └─ ProjectResearcher (intermediate entity)
       - researcher: BelongsToOne → User
       - task: BelongsToOne → Task
       - role: enum (lead/participant)
       - participation_rate: integer
       - begin_at, end_at: date
```

### Joint Ownership / Joint Achievement Pattern

When multiple people are connected to a single result:

```
Achievement ↔ Researcher
  └─ AchievementParticipant (intermediate entity)
       - achievement: BelongsToOne → Achievement
       - researcher: BelongsToOne → User
       - is_primary: boolean (whether they are the original registrant)
       - contribution_rate: integer (optional)
```

**Key point**: The achievement is registered once, and participants are linked to it (prevents duplication)

### Status History Pattern

When status change history needs to be managed:

```
Application (ApplyDeliberation)
  └─ ApplicationHistory (ApplyDeliberationHistory)
       - apply_deliberation: BelongsToOne → ApplyDeliberation
       - status: enum (previous status or changed status)
       - changed_at: date
       - changed_by: BelongsToOne → User
       - reason: string
```

### Change Request Pattern

When data changes require an approval process:

```
Task
  └─ TaskChangeRequest
       - task: BelongsToOne → Task
       - status: enum (requested/approved/rejected)
       - reason: string
       - requested_by: BelongsToOne → User
       - requested_at: date
       - approved_by: BelongsToOne → User (nullable)
       - approved_at: date (nullable)

  └─ TaskChangeHistory
       - change_request: BelongsToOne → TaskChangeRequest
       - change_type: enum (add/delete/update)
       - target_user: BelongsToOne → User (subject of change)
       - before_value: json (before change, optional)
       - after_value: json (after change, optional)
```

---

## Common Domain Patterns

### Organizational Structure (Institution-Department-User)

```
Institution
  └─ departments: HasMany → Department

Department
  └─ institution: BelongsToOne → Institution
  └─ employees: HasMany → User

User
  └─ institution: BelongsToOne → Institution
  └─ department: BelongsToOne → Department
```

### Project Participation (Project-Participant)

```
Project
  └─ participants: HasMany → ProjectParticipant
  └─ owner: BelongsToOne → User

ProjectParticipant [intermediate entity]
  └─ project: BelongsToOne → Project
  └─ user: BelongsToOne → User
  └─ role: enum
  └─ participation_rate: integer
  └─ begin_at, end_at: date
```

### Committee-Member

```
Committee
  └─ members: HasMany → CommitteeMember

CommitteeMember [intermediate entity]
  └─ committee: BelongsToOne → Committee
  └─ user: BelongsToOne → User
  └─ member_type: enum (internal/external)
  └─ participate_year: string
```

### Review/Evaluation (Target-Reviewer-Result)

```
EvaluationTarget
  └─ committee: BelongsToOne → Committee
  └─ target_entity: BelongsToOne → Task (or polymorphic)

EvaluationResult
  └─ target: BelongsToOne → EvaluationTarget
  └─ evaluator: BelongsToOne → CommitteeMember
  └─ score: integer or enum (approved/rejected)
  └─ opinion: string
```

### Step-by-Step Data Flow (Application → Confirmation)

When data moves through stages:

```
ApplyDeliberation
  └─ task: OneToOne → Task (references the task created on approval)

Task
  └─ apply_deliberation: BelongsToOne → ApplyDeliberation (references the original application)
```

**Key point**: Bidirectional references allow querying from either side

---

## Which Relationship to Use?

| Situation | Relationship type | Example |
|------|----------|------|
| "A belongs to B" (N:1) | `BelongsToOne` | Post → User (author) |
| "A has many Bs" (1:N) | `HasMany` | User → Posts |
| "A and B are 1:1" | `OneToOne` | User ↔ Employee |
| "A and B are many-to-many" | `ManyToMany` | Post ↔ Tag |

## BelongsToOne (N:1) - Most Common

**Situation**: When a Post belongs to a User (author)

```json
{
  "type": "relation",
  "name": "author",
  "with": "User",
  "relationType": "BelongsToOne",
  "nullable": true,
  "onUpdate": "CASCADE",
  "onDelete": "SET NULL",
  "desc": "author"
}
```

**Auto-generated**: `author_id` column (FK)

**Note**: Do not define `author_id` directly in props (it is auto-generated)

**Optional options:**
- `customJoinClause`: custom JOIN condition SQL (specify JOIN condition directly instead of FK)
- `useConstraint`: whether to create FK constraint (default: `true`). If `false`, the FK column is created but no DB constraint is generated

### Using FK in Code

Since a BelongsToOne relationship automatically creates a `{name}_id` column, use the correct field name when working with it directly in Model, FixtureGenerator, etc.

**Correct pattern:**
```typescript
// Entity definition
{
  "type": "relation",
  "name": "company",
  "with": "Company",
  "relationType": "BelongsToOne"
}

// In Model save() or FixtureGenerator
const department = {
  name: "Engineering",
  company_id: 1  // ✓ CORRECT: {relation_name}_id form
};

await puri.ubRegister("departments", department);
```

**Wrong pattern (common mistake):**
```typescript
// ✗ WRONG: using relation name directly
const department = {
  name: "Engineering",
  company: 1  // FK is not set! company_id is saved as NULL
};

// ✗ WRONG: passing as object
const department = {
  name: "Engineering",
  company: { id: 1 }  // FK is not set!
};
```

**FixtureGenerator example:**
```typescript
// inside fixture-generator.ts
if (isBelongsToOneRelationProp(prop) ||
    (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) {
  const relationValue = await this.generateRelationValue(entity, prop, context);

  // ✓ CORRECT: set FK as {prop.name}_id
  fixture[`${prop.name}_id`] = relationValue;
} else {
  fixture[prop.name] = relationValue;
}
```

**Key points:**
- Entity JSON: `"name": "company"` (relation name)
- DB column: `company_id` (auto-generated)
- TypeScript code: use `company_id` (setting FK)
- Entity subset: `"company.id"` form (FieldExpr)

## HasMany (1:N) - For Reverse Lookup

**Situation**: When you want to query a User's Posts

```json
{
  "type": "relation",
  "name": "posts",
  "with": "Post",
  "relationType": "HasMany",
  "joinColumn": "author_id",
  "desc": "authored posts"
}
```

**Required**: `joinColumn` = FK column name in the related table

**Optional**: `fromColumn` = matching column in your own table (default: `id`). Use when JOIN needs to use a non-standard PK

**Important**: If the `joinColumn` field is not defined, a Zod schema validation error will occur.

**No DB column is created** (virtual)

**When is it needed?**
- When reverse lookup like `user.posts.title` is needed in a Subset
- Can be omitted if not needed

### HasMany Performance Optimization

HasMany relationships are automatically optimized using the **DataLoader pattern**:
- Parent record IDs are collected in batches
- All child records are queried in a single `whereIn` query
- **No N+1 query problem**

This optimization is applied automatically and requires no additional configuration.

**Implementation location**: `processLoaders` method in `modules/sonamu/src/database/base-model.ts`

## OneToOne (1:1)

**Situation**: When User and Employee are 1:1

**The side holding the FK** (Employee):
```json
{
  "type": "relation",
  "name": "user",
  "with": "User",
  "relationType": "OneToOne",
  "hasJoinColumn": true,
  "onUpdate": "CASCADE",
  "onDelete": "CASCADE",
  "desc": "user"
}
```

**The side without the FK** (User):
```json
{
  "type": "relation",
  "name": "employee",
  "with": "Employee",
  "relationType": "OneToOne",
  "nullable": true,
  "desc": "employee info"
}
```

**Key point**: FK is only created on the side with `hasJoinColumn: true` (omitting it means no FK; it is an optional option)

**Optional options (when `hasJoinColumn: true`):**
- `customJoinClause`: custom JOIN condition SQL
- `useConstraint`: whether to create FK constraint (default: `true`)

## ManyToMany (N:M)

**Situation**: When Post and Tag are many-to-many

```json
{
  "type": "relation",
  "name": "tags",
  "with": "Tag",
  "relationType": "ManyToMany",
  "joinTable": "posts__tags",
  "onUpdate": "CASCADE",
  "onDelete": "CASCADE",
  "desc": "tags"
}
```

**Required**: `joinTable`, `onUpdate`, `onDelete`

### ManyToMany Naming Conventions

**joinTable (join table name)**: use **double** underscore
```
User ↔ Role → user__roles
Post ↔ Tag → posts__tags (alphabetical order recommended)
```

**joinColumn (join table column name)**: use **single** underscore
```
user__roles table:
  - user_id (single underscore)
  - role_id (single underscore)
```

**Example**:
```typescript
// Entity: User
{
  "name": "roles",
  "relationType": "ManyToMany",
  "with": "Role",
  "joinTable": "user__roles"  // double underscore
}

// In Model save():
puri.ubRegister("user__roles", {
  user_id,   // single underscore
  role_id    // single underscore
});
```

## Self-Reference

**Situation**: When an Employee's manager is also an Employee

```json
{
  "type": "relation",
  "name": "manager",
  "with": "Employee",
  "relationType": "BelongsToOne",
  "nullable": true,
  "onUpdate": "CASCADE",
  "onDelete": "SET NULL",
  "desc": "direct manager"
}
```

**Required**: `nullable: true` (top-level has no manager)

## IMPORTANT: parentId and Parent Subset HasMany Cannot Be Used Together

### Problem

When parentId is set, the **FK column is removed from the child entity's BaseSchema**.
In this state, if the parent's subset includes the child via HasMany, the SSO LoaderQuery
executes `whereIn("child.parent_fk", fromIds)`, but since the FK is missing, a TypeScript error occurs.

```
Error: '{child_table}.{parent_fk}' is not assignable to type 'AvailableColumns'
```

### Solution: Choose One of the Two

| Requirement | Choice | parentId | HasMany in parent subset |
|---------|------|----------|------------------------|
| Query child list together in parent detail view | Independent entity | ✗ not used | ✓ possible |
| Child is CRUD'd only through parent | Use parentId | ✓ used | ✗ not possible |

### Decision Criteria

| Question | Yes → Independent entity | No → parentId |
|------|-----------------|------------------|
| Will the child ever be queried/modified standalone? | ✓ | |
| Does the admin screen need a separate child list page? | ✓ | |
| Is the child list queried as a subset in the parent detail? | ✓ | |

### Example

```json
// DO NOT - Incorrect (causes error)
// entity: ApplyDeliberationResearcher
{ "parentId": "apply_deliberation_id" }  // FK removed from BaseSchema

// entity: ApplyDeliberation subset
{ "A": ["*", { "researchers": ["*"] }] }  // SSO LoaderQuery error

// DO - Correct (change to independent entity, remove parentId)
// entity: ApplyDeliberationResearcher - no parentId, FK is preserved in BaseSchema
// entity: ApplyDeliberation subset
{ "A": ["*", { "researchers": ["*"] }] }  // works correctly
```

---

## FK Reference Rules (FieldExpr)

When a BelongsToOne relationship is defined, a `{name}_id` column is automatically created. **In subsets, reference using the `{name}.id` form (FieldExpr)**, and **in indexes, use the actual DB column name (`{name}_id`)**.

### Where It Applies

| Location | Format | Example |
|------|----------|------|
| subsets | FieldExpr (`relation.field`) | `"user.id"` |
| indexes | actual DB column name | `"user_id"` |
| unique | actual DB column name | `["user_id", "date"]` |
| search | FieldExpr (`relation.field`) | `"user.id"` |

### Example

```json
{
  "id": "ApiLog",
  "props": [
    { "type": "relation", "name": "user", "with": "User", "relationType": "BelongsToOne" }
  ],
  "subsets": {
    "A": ["id", "user.id", "api_path"]  // use FieldExpr
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

> **Note:** For a detailed explanation of the difference in reference methods between indexes and subsets, see the "IMPORTANT: In indexes, use the actual DB column name for FK columns" section in `entity-basic.md`.

---

## Common Mistakes

| Mistake | Fix |
|------|------|
| Using a separate `"relations": [...]` section | Define with `"type": "relation"` inside `props` |
| Directly defining `{name}_id` in BelongsToOne | Delete it (auto-generated) |
| Using `user_id` directly in Subset | Change to `user.id` form |
| Mismatch of FK intent in OneToOne | Explicitly set `hasJoinColumn: true` on the side holding the FK (optional, no FK if omitted) |
| Missing `joinColumn` in HasMany | Specify the FK column name in the related table |
| Missing `onUpdate/onDelete` in ManyToMany | Add as required |
| Inconsistent joinTable name | Consistent naming recommended (alphabetical order) |
| `nullable: false` in self-reference | Change to `nullable: true` |

## Using Relationships in Subsets
- See `subset.md`
```json
{
  "subsets": {
    "A": [
      "id",
      "title",
      "author.id",
      "author.username",
      "author.department.name"
    ]
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

export const ProjectSaveParams = ProjectBaseSchema
  .partial({
    id: true,
    created_at: true,
  })
  .extend({
    employee_ids: z.array(z.number().int().positive()),  // ManyToMany: employee
    tag_ids: z.array(z.number().int().positive()),       // ManyToMany: tags
  })
  .omit({
    virtual_test: true,           // remove virtual fields
    virtual_query_test: true,
    textsearchable_index_col: true,  // remove generated fields
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
await QuestionCollectionModel.save([
  { ...collectionData, title: "Updated Title" }
]);

// CORRECT - extract ids from categories and pass them
const { categories, ...collectionData } = collection;
const category_ids = categories?.map(c => c.id) ?? [];
await QuestionCollectionModel.save([
  { ...collectionData, category_ids, title: "Updated Title" }
]);
```

### Managing Bidirectional ManyToMany

**Principle: Manage from one side only**

```typescript
// Project Entity: employee (ManyToMany)
// Employee Entity: projs (ManyToMany, same join table)

// project.types.ts - manages employee_ids
export const ProjectSaveParams = ProjectBaseSchema
  .extend({
    employee_ids: z.array(z.number().int().positive()),
  });

// employee.types.ts - does not manage proj_ids
export const EmployeeSaveParams = EmployeeBaseSchema
  .partial({ id: true, created_at: true });
// proj_ids is not added
```

**Reason:**
- Managing from both sides causes synchronization issues
- Managing from the primary Entity (Project) only is clearer
- When querying Employee, projs are automatically joined and returned

**Key point:** ManyToMany relationships are defined in Entity JSON, but in code they are explicitly managed as `{relation}_ids` arrays, and bidirectional relationships are managed from one side only.
