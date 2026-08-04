---
name: sonamu-entity
description: Defines and modifies Sonamu entities: fields, relationships, subsets, and the sync pipeline. Use when creating or editing an entity.json, adding a field or enum, wiring BelongsToOne/HasMany/ManyToMany/parentId, defining a subset, or resolving a schema validation or sync error. Covers stub entity, sonamu sync, dbDefault, OrderBy enums, FieldExpr, and nullable handling in types.ts.
---

# Sonamu Entity

Working code references:

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

## After editing an entity.json

Generated output — `types.ts`, `sonamu.generated.ts` — stays stale until a sync runs:

```bash
cd packages/api
pnpm sonamu sync          # regenerate what changed
pnpm sonamu sync --force  # full re-sync, ignores sonamu.lock
```

A running `pnpm dev` does the same through its file watcher, so no separate command is needed
while it is up. The standalone command reads `dist/sonamu.config.js` and fails with
`ERR_MODULE_NOT_FOUND` if the API package has never been built — `pnpm build` once fixes it.

## Checklist for New Entity Creation

1. id: PascalCase (e.g., `User`, `BlogPost`)
2. table: snake_case plural (e.g., `users`, `blog_posts`) — can be omitted
3. title: display name
4. Recommended props: `id`, `created_at` (not enforced by schema but best practice)
5. Recommended enums: `{EntityId}OrderBy`, `{EntityId}SearchField` (not enforced but best practice)

## Decisions that are expensive to reverse

Cheap to settle before the entity.json exists, costly once code depends on them. How you settle
them — asking the user, reading the spec — is your project's call.

Domain term ↔ EntityId mapping (e.g. "위탁연구과제" → `ResearchContract`). Renaming an
EntityId later also renames the table, generated types, model, and every scaffolded view.

Polymorphic association (`entity_type` + `entity_id`): if any target entity has a string PK
(e.g. a better-auth `User`), type `entity_id` as `string` for all of them. Otherwise `integer`.

parentId: a child with `parentId` has no independent CRUD, so adding or removing it later
rewrites the child's model and views. See "Parent-Child Relationships" below.

Relations to entities the spec implies but does not name — content domains usually grow
Comment / Like / Tag / Category; commerce grows Review / Cart / Payment; reservations grow
Schedule; courses grow Enrollment / Progress. Adding one later is routine; discovering it after
the surrounding relations are built usually means reworking them.

`User.id` is an auto-increment sequence PK, not a login ID. With better-auth, a separate
`login_id` prop is unnecessary — the auth tables manage credentials.

## Parent-Child Relationships (parentId)

### What is parentId?

A top-level option used when a child entity is managed as a dependent of a parent entity.

- With parentId: the child has no independent CRUD — it is created, updated, and deleted through the parent
- Without parentId: an independent entity with its own CRUD

### What decides parentId

Not inferable from the entity's shape — it follows from how the data is used, which lives in the
domain rather than the schema. Switching later rewrites the child's model and views, so it is worth
settling before the entity.json is written.

| Situation                                | parentId | Example                            |
| ---------------------------------------- | -------- | ---------------------------------- |
| Cannot exist without a parent            | Yes      | OrderItem → Order                  |
| Created and deleted together with parent | Yes      | Chapter → Course, Lesson → Chapter |
| Queried, updated, or listed on its own   | No       | Comment → Post                     |
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

Child entities with parentId must be placed in the same folder as the root parent entity.

| Structure                    | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `course/course.entity.json`  | Root entity                                       |
| `course/chapter.entity.json` | parentId: "Course" → same folder                  |
| `course/lesson.entity.json`  | parentId: "Chapter" → same folder (based on root) |
| `course/course.types.ts`     | types.ts generated only for root                  |

A child in its own folder (`chapter/chapter.entity.json`) is not resolved against its root.
