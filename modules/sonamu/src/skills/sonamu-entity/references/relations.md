# Relationships

## Relationship Selection Guide

### 1:N vs N:M Decision Criteria

| Question                                           | 1:N (BelongsToOne) | N:M (ManyToMany or intermediate entity) |
| -------------------------------------------------- | ------------------ | --------------------------------------- |
| Can one A belong to multiple Bs?                   | No                 | Yes                                     |
| Does the relationship need additional information? | No                 | Yes → intermediate entity               |
| Can it be expressed as "A belongs to B"?           | Yes                | No                                      |

Examples:

- Post → Author: 1:N (a post has one author)
- Post ↔ Tag: N:M (multiple posts have multiple tags)
- Researcher ↔ Task: N:M + intermediate entity (participation rate, role, and other additional info)

### When an Intermediate Entity Is Needed

If an N:M relationship has additional information, use an intermediate entity instead of ManyToMany.

| Situation                              | ManyToMany | Intermediate entity |
| -------------------------------------- | ---------- | ------------------- |
| Only a simple connection is needed     | ✓          |                     |
| Relationship needs a date/period       |            | ✓                   |
| Relationship needs a role/status       |            | ✓                   |
| Relationship needs a quantity/ratio    |            | ✓                   |
| Relationship history management needed |            | ✓                   |

Intermediate entity example:

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

Key point: The achievement is registered once, and participants are linked to it (prevents duplication)

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

Key point: Bidirectional references allow querying from either side

## Which Relationship to Use?

| Situation                  | Relationship type | Example              |
| -------------------------- | ----------------- | -------------------- |
| "A belongs to B" (N:1)     | `BelongsToOne`    | Post → User (author) |
| "A has many Bs" (1:N)      | `HasMany`         | User → Posts         |
| "A and B are 1:1"          | `OneToOne`        | User ↔ Employee      |
| "A and B are many-to-many" | `ManyToMany`      | Post ↔ Tag           |

## BelongsToOne (N:1) - Most Common

Situation: When a Post belongs to a User (author)

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

Auto-generated: `author_id` column (FK)

Note: Do not define `author_id` directly in props (it is auto-generated)

Optional options:

- `customJoinClause`: custom JOIN condition SQL (specify JOIN condition directly instead of FK)
- `useConstraint`: whether to create FK constraint (default: `true`). If `false`, the FK column is created but no DB constraint is generated

### Using FK in Code

Since a BelongsToOne relationship automatically creates a `{name}_id` column, use the correct field name when working with it directly in Model, FixtureGenerator, etc.

Correct pattern:

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

Wrong pattern (common mistake):

```typescript
// ✗ WRONG: using relation name directly
const department = {
  name: "Engineering",
  company: 1, // FK is not set! company_id is saved as NULL
};

// ✗ WRONG: passing as object
const department = {
  name: "Engineering",
  company: { id: 1 }, // FK is not set!
};
```

FixtureGenerator example:

```typescript
// inside fixture-generator.ts
if (isBelongsToOneRelationProp(prop) || (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) {
  const relationValue = await this.generateRelationValue(entity, prop, context);

  // ✓ CORRECT: set FK as {prop.name}_id
  fixture[`${prop.name}_id`] = relationValue;
} else {
  fixture[prop.name] = relationValue;
}
```

Key points:

- Entity JSON: `"name": "company"` (relation name)
- DB column: `company_id` (auto-generated)
- TypeScript code: use `company_id` (setting FK)
- Entity subset: `"company.id"` form (FieldExpr)

## HasMany (1:N) - For Reverse Lookup

Situation: When you want to query a User's Posts

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

Required: `joinColumn` = FK column name in the related table

Optional: `fromColumn` = matching column in your own table (default: `id`). Use when JOIN needs to use a non-standard PK

Omitting the `joinColumn` field raises a Zod schema validation error.

No DB column is created (virtual)

When is it needed?

- When reverse lookup like `user.posts.title` is needed in a Subset
- Can be omitted if not needed

### HasMany Performance Optimization

HasMany relationships are automatically optimized using the DataLoader pattern:

- Parent record IDs are collected in batches
- All child records are queried in a single `whereIn` query
- No N+1 query problem

This optimization is applied automatically and requires no additional configuration.

Implementation location: `processLoaders` method in `modules/sonamu/src/database/base-model.ts`

## OneToOne (1:1)

Situation: When User and Employee are 1:1

The side holding the FK (Employee):

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

The side without the FK (User):

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

Key point: FK is only created on the side with `hasJoinColumn: true` (omitting it means no FK; it is an optional option)

Optional options (when `hasJoinColumn: true`):

- `customJoinClause`: custom JOIN condition SQL
- `useConstraint`: whether to create FK constraint (default: `true`)

## ManyToMany (N:M)

Situation: When Post and Tag are many-to-many

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

Required: `joinTable`, `onUpdate`, `onDelete`

### ManyToMany Naming Conventions

joinTable (join table name): use double underscore

```
User ↔ Role → user__roles
Post ↔ Tag → posts__tags (alphabetical order recommended)
```

joinColumn (join table column name): use single underscore

```
user__roles table:
  - user_id (single underscore)
  - role_id (single underscore)
```

Example:

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

Situation: When an Employee's manager is also an Employee

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

Required: `nullable: true` (top-level has no manager)

## parentId and a parent-subset HasMany are mutually exclusive

### Problem

When parentId is set, the FK column is removed from the child entity's BaseSchema.
In this state, if the parent's subset includes the child via HasMany, the SSO LoaderQuery
executes `whereIn("child.parent_fk", fromIds)`, but since the FK is missing, a TypeScript error occurs.

```
Error: '{child_table}.{parent_fk}' is not assignable to type 'AvailableColumns'
```

### Solution: Choose One of the Two

| Requirement                                     | Choice             | parentId   | HasMany in parent subset |
| ----------------------------------------------- | ------------------ | ---------- | ------------------------ |
| Query child list together in parent detail view | Independent entity | ✗ not used | ✓ possible               |
| Child is CRUD'd only through parent             | Use parentId       | ✓ used     | ✗ not possible           |

### Decision Criteria

| Question                                                    | Yes → Independent entity | No → parentId |
| ----------------------------------------------------------- | ------------------------ | ------------- |
| Will the child ever be queried/modified standalone?         | ✓                        |               |
| Does the admin screen need a separate child list page?      | ✓                        |               |
| Is the child list queried as a subset in the parent detail? | ✓                        |               |

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

