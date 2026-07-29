---
name: sonamu-entity
description: Defines and modifies Sonamu entities: fields, relationships, subsets, and the sync pipeline. Use when creating or editing an entity.json, adding a field or enum, wiring BelongsToOne/HasMany/ManyToMany/parentId, defining a subset, or resolving a schema validation or sync error. Covers stub entity, sonamu sync, dbDefault, OrderBy enums, FieldExpr, and nullable handling in types.ts.
---

# Sonamu Entity

**Working code references:**

- `sonamu/examples/miomock/api/src/application/user/user.entity.json` — basic entity
- `sonamu/examples/miomock/api/src/application/project/project.entity.json` — complex entity
- `sonamu/examples/miomock/api/src/application/employee/employee.entity.json` — BelongsToOne

## Reference Map

| Need | Read |
| --- | --- |
| Step-by-step creation, validation before/after sync, migration and scaffolding checks | `references/creation-workflow.md` |
| Field types, dbDefault, OrderBy enum rules, integer vs number, ENUM defaults | `references/field-types.md` |
| Choosing a relationship type, BelongsToOne/HasMany/OneToOne/ManyToMany/self-reference, parentId | `references/relations.md` |
| FK reference rules (FieldExpr), relationships inside subsets, ManyToMany type definitions | `references/relations-detail.md` |
| Response field scope, naming conventions, ID-only optimization | `references/subset.md` |
| Domain-specific design patterns and worked examples | `references/design-guides.md` |

Migration execution and schema-change errors live in the `sonamu-migration` skill.
cone metadata and fixture generation live in `sonamu-fixture`.

---

## Prerequisite: CRITICAL

**Always run `pnpm dev` in `packages/api` before creating or editing an entity.**

```bash
cd packages/api
pnpm dev  # keep running for all entity work
```

In dev mode the syncer detects `entity.json` changes and auto-generates `types.ts`. This is
required for **all** entity creation, not just auth entities.

---

## When a User Requests a New System

When the user requests a system to be built, proceed in the following order:

**1. Analyze requirements** (identify missing entities)

- "Do you need a User entity?"
- "Are there any other entities needed?"

**2. Confirm relationships between entities** (one question at a time)

- "Is A to B a 1:N or N:M relationship?"
- "Should chapters be managed as children of courses?"

**3. Decide whether to use parentId**

- "Can it exist without a parent?"
- "Should it be created and deleted together with the parent?"

**4. Final confirmation with the user**

- Finalize entity list
- Provide a relationship diagram or clear description

### Entity Design Done Checklist

- [ ] All required entities identified
- [ ] Relationships between entities defined
- [ ] parentId usage decided
- [ ] User confirmation complete

**When done:** proceed to "Entity Creation Workflow"

---


## Checklist for New Entity Creation

1. **id**: PascalCase (e.g., `User`, `BlogPost`)
2. **table**: snake_case plural (e.g., `users`, `blog_posts`) — can be omitted
3. **title**: display name
4. **Recommended props**: `id`, `created_at` (not enforced by schema but best practice)
5. **Recommended enums**: `{EntityId}OrderBy`, `{EntityId}SearchField` (not enforced but best practice)

## IMPORTANT: Analyze Requirements Before Creating Entity

**STOP! Ask questions one at a time before creating any entity.**

### Identify missing entities

Do not only create entities explicitly mentioned by the user. **Ask one at a time:**

- "Do you need a User entity?" → wait for response
- "Does the User have multiple roles?" → wait for response
- "Are there any other entities needed?" → wait for response

**Note on User entity**: `id` is an auto-increment sequence (PK) and is not a login ID. When using better-auth, a separate `login_id` is not needed (managed by the auth table).

**Commonly missed entities**: Content (Comment, Like, Tag, Category), Commerce (Review, Cart, Payment), Reservation (Reservation, Schedule), Education (Enrollment, Progress)

### When multiple entities are requested — confirm relationships

When 2+ entities are requested, **ask about relationships one at a time before writing any code**:

- Which relationship type: BelongsToOne, HasMany, ManyToMany, or parentId
- Whether it is a parent-child dependency (delete together) or independent

### Always confirm before designing

**1. Polymorphic Association** (`entity_type + entity_id` pattern):

- If there is a string PK entity (e.g., better-auth User) → use `string` type for `entity_id` uniformly
- Otherwise → `integer` is fine

**2. Domain term ↔ entity English ID mapping**: finalize with the user before writing any code (e.g., "위탁연구과제" → `ResearchContract`). Changing this later requires a full rename.

## Parent-Child Relationships (parentId)

### What is parentId?

A top-level option used when a child entity is managed as a dependent of a parent entity.

- With parentId: the child has no independent CRUD — it is created, updated, and deleted through the parent
- Without parentId: an independent entity with its own CRUD

### When to use parentId

| Situation                                | parentId | Example                            |
| ---------------------------------------- | -------- | ---------------------------------- |
| Cannot exist without a parent            | Yes      | OrderItem → Order                  |
| Created and deleted together with parent | Yes      | Chapter → Course, Lesson → Chapter |
| Can be independently CRUD'd              | No       | Comment → Post                     |
| Can belong to multiple parents           | No       | Tag → Post (ManyToMany)            |

### parentId usage example

```json
{
  "id": "OrderItem",
  "table": "order_items",
  "title": "Order Item",
  "parentId": "Order",
  "props": [...]
}
```

### Child entities with parentId do not generate types.ts

Child entities with parentId set (e.g., Chapter, Lesson) do not get their own `types.ts` file. This is expected behavior — child entities are managed through the parent. If you need independent CRUD and types.ts, do not use parentId.

### Folder location for parentId child entities

Child entities with parentId must be placed **in the same folder as the root parent entity**.

| Structure                    | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `course/course.entity.json`  | Root entity                                       |
| `course/chapter.entity.json` | parentId: "Course" → same folder                  |
| `course/lesson.entity.json`  | parentId: "Chapter" → same folder (based on root) |
| `course/course.types.ts`     | types.ts generated only for root                  |

**Note:** Do not create child entities in a separate folder (e.g., `chapter/chapter.entity.json`).

### IMPORTANT: When Uncertain - Ask User (Never Guess)

**Do not guess — ask.** In situations like the following, ask the user directly:

- "Should chapters be managed as children of courses, or created as an independent entity?"
- "Should order items be saved together with the order, or managed separately?"

**When in doubt, ask. One question is better than a wrong design.**

**Helpful questions to ask the user:**

- "Will this data ever need to be queried or updated independently without a parent?"
- "Should this data be deleted when the parent is deleted?"
- "Does the admin UI need a separate list page for this?"
