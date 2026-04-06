---
name: sonamu-scaffolding
description: Reference for using Sonamu UI Scaffolding. Common errors and solutions. Use when scaffolding models or views.
---

# Scaffolding Troubleshooting

## CRITICAL: Required Scaffolding Items

**The following 5 items must all be scaffolded for every entity:**

| Item                | Description                        |
| ------------------- | ---------------------------------- |
| `model`             | CRUD model based on BaseModelClass |
| `model_test`        | Model test file                    |
| `view_list`         | List view component                |
| `view_search_input` | Search input component             |
| `view_form`         | Create/edit form component         |

**DO NOT:** scaffold only model and model_test and skip the view-related items

---

## Pre-Scaffolding Checklist

Run from the **`packages/api`** directory:

1. **Wait for entity change detection**: After creating an entity, wait for the syncer to auto-generate `types.ts` (2-3 seconds)
2. **Check types.ts file**: If not auto-generated, create it manually
3. **Create and run migration**: Create migration from Sonamu UI → `pnpm sonamu migrate run`
4. **Complete TypeScript build**: Run `pnpm build` to generate `.js` files in `dist/`
5. **Restart dev server**: `pnpm dev` (restart required after build)

## Post-Scaffolding Required Checklist

**CRITICAL: After scaffolding is complete, you must perform the following steps.**

### 1. Build Test

```bash
cd packages/api
pnpm build

cd packages/web
pnpm build
```

- [ ] API build succeeds
- [ ] Web build succeeds

### 2. Restart Dev Server

```bash
cd packages/api
pnpm dev
```

- [ ] Server running normally

### 3. If Relations Exist (Add i18n Keys)

**Required**: Must be done if the entity has a BelongsToOne or any relation

```typescript
// packages/api/src/i18n/ko.ts
export default {
  // ... existing keys

  // Add for each entity with relations
  "entity.Post.author_id": "Author",
  "entity.Question.collection_id": "Collection",
  "entity.Question.parent_id": "Parent Question",
  "entity.Employee.department_id": "Department",
  "entity.Task.principal_investigator_id": "Principal Investigator",

  // ...
} as const;
```

**Pattern**: `entity.{EntityId}.{relation}_id`

- Add `_id` suffix to the relation name
- Example: `author` relation → `author_id` key

- [ ] i18n keys added for all entities with relations

### 4. Add OrderBy Cases (When values other than id-desc are used)

**Optional**: Perform if the OrderBy enum in entity.json has values other than `id-desc`

```typescript
// packages/api/src/application/{entity}/{entity}.model.ts

// Generated code
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else {
  exhaustive(params.orderBy); // type error!
}

// Fix: add the remaining cases
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else if (params.orderBy === "created_at-desc") {
  qb.orderBy("posts.created_at", "desc");
} else if (params.orderBy === "name-asc") {
  qb.orderBy("posts.name", "asc");
} else {
  exhaustive(params.orderBy); // no more type errors
}
```

- [ ] OrderBy cases added

### 5. Handle Nullable Fields in types.ts (Required Before Testing!)

**Required**: Handle nullable fields in types.ts for all entities

```typescript
// packages/api/src/application/{entity}/{entity}.types.ts

// Generated code
export const PostSaveParams = PostBaseSchema.partial({
  id: true,
  created_at: true,
});

// Fix: add nullable fields
export const PostSaveParams = PostBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true, // nullable field
  category: true, // nullable field
  description: true, // nullable field
}).extend({
  updated_at: z.date().nullish(),
  category: z.string().nullish(),
  description: z.string().nullish(),
});
```

**Detailed guide**: See "Tasks to do immediately after entity creation" in `testing.md`

- [ ] Nullable fields handled in types.ts for all entities

### Completion Confirmation

```
Post-scaffolding required checklist complete
→ Next step: write tests (testing.md)

⚠️ If nullable fields in types.ts are not handled,
   type errors will occur when writing tests!
```

---

## Common Errors

| Error                                       | Cause                                                 | Fix                                        |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| "Non-existent module path requested {Type}" | types.ts not created or not compiled                  | Wait/create manually → build → restart dev |
| exhaustive() type error                     | Only the first OrderBy value is handled automatically | See "4. Add OrderBy Cases" above           |
| Missing i18n key (relation)                 | `author_id` vs `author`                               | See "3. If Relations Exist" above          |
| IdAsyncSelect API mismatch                  | Old scaffolding template used                         | See "IdAsyncSelect API Migration" below    |

## Detailed Explanations

### "Non-existent module path requested" Error

Scaffolding reads types exported from `dist/application/{entity}/{entity}.types.js` to register module paths.

```typescript
// modules/sonamu/src/entity/entity.ts
const typesFilePath = path.join(
  Sonamu.apiRootPath,
  runtimePath(`dist/application/${typesModulePath}.js`),
);
if (await exists(typesFilePath)) {
  // register type
}
```

### Automatic types.ts Generation Mechanism

When an entity is created, the syncer's `handleTruthSourceChanges` automatically runs the `init_types` template:

```typescript
// modules/sonamu/src/syncer/syncer.ts - handleTruthSourceChanges function
if (entityId) {
  const entity = EntityManager.get(entityId);
  const typeFilePath = path.join(...);
  if (entity.parentId === undefined && !(await exists(typeFilePath))) {
    await generateTemplate("init_types", { entityId });
  }
}
```

**Auto-generation conditions**:

- When `parentId` is absent (top-level entity)
- When the `types.ts` file does not yet exist

**Causes of errors**:

- Attempting scaffolding immediately after entity creation before the syncer has run
- types.ts was created but the build has not completed so the `.js` file is missing

**Resolution order** (run from `packages/api`):

1. Wait briefly after entity creation for the syncer to generate types.ts (2-3 seconds)
2. If types.ts is missing, create it manually (see template below)
3. Create migration (Sonamu UI) and run it (`pnpm sonamu migrate run`)
4. Compile TypeScript with `pnpm build`
5. Restart `pnpm dev`
6. Retry scaffolding

### Manual types.ts Creation (If Needed)

For cases where auto-generation did not occur due to a syncer timing issue:

```typescript
// {entity}.types.ts
import type { z } from "zod";
import { {Entity}BaseListParams, {Entity}BaseSchema } from "../sonamu.generated";

// {Entity} - ListParams
export const {Entity}ListParams = {Entity}BaseListParams;
export type {Entity}ListParams = z.infer<typeof {Entity}ListParams>;

// {Entity} - SaveParams
export const {Entity}SaveParams = {Entity}BaseSchema.partial({ id: true, created_at: true });
export type {Entity}SaveParams = z.infer<typeof {Entity}SaveParams>;
```

**IMPORTANT: Entity with `updated_at` field**:

If the entity has an `updated_at` field defined, it must also be included in the partial of SaveParams.
Since the form does not accept `updated_at` as direct input, it must be optional to avoid type errors.

```typescript
// For entities with updated_at
export const {Entity}SaveParams = {Entity}BaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true  // ← add this
});
```

### exhaustive() Type Error

`exhaustive` is a utility function provided by sonamu.

```typescript
import { exhaustive } from "sonamu";
```

The scaffolding template only handles the **first value** of the `OrderBy` enum automatically.

```typescript
// Generated code
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else {
  exhaustive(params.orderBy); // remaining cases unhandled → type error
}
```

**Fix**: Manually add all OrderBy cases

```typescript
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else if (params.orderBy === "created_at-desc") {
  qb.orderBy("posts.created_at", "desc");
} else {
  exhaustive(params.orderBy);
}
```

### i18n Key Error (relation prop)

An entity's relation prop is defined as `author`, and the i18n label in `sd.generated.ts` is generated as `entity.Post.author`.
**However**, the scaffolded form.tsx template uses the FK column name `author_id`.

```typescript
// Scaffolded form.tsx (actually generated code)
{SD("entity.Post.author_id")}  // ← uses _id suffix

// sd.generated.ts (auto-generated keys)
"entity.Post.author": "Author"  // ← no _id
```

**Fix (choose one)**:

1. **Manually add `_id` key to ko.ts** (recommended):

```typescript
// packages/api/src/i18n/ko.ts
export default {
  // ... existing keys
  "entity.Post.author_id": "Author",
  "entity.Question.collection_id": "Collection",
  "entity.Question.parent_id": "Parent Question",
  // ...
} as const;
```

2. **Remove `_id` from form.tsx** (requires manual edit):

```typescript
// Manual edit after scaffolding
{
  SD("entity.Post.author");
} // remove _id
```

**Recommended**: First option - add the `_id` key to ko.ts. It is preserved during sync and can be reused across multiple forms.

### IdAsyncSelect API Migration

#### Background

When the `@sonamu-kit/react-components` package was updated, the IdAsyncSelect API changed, but the scaffolding generation code (`scaffolding/react-components.ts`) still generates code based on the old API.

Therefore, running `pnpm sonamu scaffold` generates wrapper components based on the old API, causing build errors in projects using the latest package.

#### Specific API Changes

**Old API (code generated by scaffolding):**

```typescript
export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onValueChange,
  listParams,      // ← old API
  textField = "name",  // ← old API
  pageField,       // ← old API
  ...
}: UserIdAsyncSelectProps<T>) {
  // manual state management
  const [searchText, setSearchText] = useState("");

  const handleSearch = useCallback((text: string) => {
    setSearchText(text);
  }, []);

  return (
    <AsyncSelect  // ← old component
      config={UserAsyncIdConfig}
      subset={subset}
      listParams={{ ...listParams, [textField]: searchText }}
      textField={textField}
      pageField={pageField}
      onSearch={handleSearch}
      ...
    />
  );
}
```

**New API (actual package API):**

```typescript
export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,    // ← new API
  displayField = "name",  // ← new API
  // pageField removed  // ← removed
  ...
}: UserIdAsyncSelectProps<T>) {
  // no state management (handled internally)

  return (
    <IdAsyncSelect<number>  // ← new component + generic
      config={UserAsyncIdConfig}
      subset={subset}
      baseListParams={baseListParams}
      displayField={displayField}
      // search handled internally
      ...
    />
  );
}
```

#### Key Changes

1. **Component name**: `AsyncSelect` → `IdAsyncSelect<T>` (generic added)
2. **Prop names**:
   - `listParams` → `baseListParams`
   - `textField` → `displayField`
   - `pageField` removed
3. **Search logic**: external state management → internal handling (useState, useCallback, onSearch no longer needed)
4. **Generic type**: PK type must be specified explicitly (`<number>` or `<string>`)

#### Files That Need Updating

```
src/components/
  ├── user/UserIdAsyncSelect.tsx
  ├── account/AccountIdAsyncSelect.tsx
  ├── announcement/AnnouncementIdAsyncSelect.tsx
  └── ... (all *IdAsyncSelect.tsx files)
```

#### Migration Checklist

- [ ] Change component import: `AsyncSelect` → `IdAsyncSelect`
- [ ] Add generic type parameter: `<number>` or `<string>` (depending on PK type)
- [ ] Update Props type definitions:
  - [ ] `listParams` → `baseListParams`
  - [ ] `textField` → `displayField`
  - [ ] Remove `pageField`
- [ ] Remove manual state management:
  - [ ] Remove `useState`, `useCallback`
  - [ ] Remove `onSearch` handler
- [ ] Update prop names in JSX:
  - [ ] `listParams={...}` → `baseListParams={...}`
  - [ ] `textField={...}` → `displayField={...}`
  - [ ] Remove `pageField`
  - [ ] Remove `onSearch`

#### Why does this happen?

This occurs when the scaffolding generation code in Sonamu has not been updated to reflect the latest package API, while the user has modified the local Sonamu source and the package has been updated but the scaffolding template has not.

**Fix**: Manually update the generated components according to the checklist above, or update the scaffolding template in the Sonamu core to use the latest API.
