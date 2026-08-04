# Scaffolding

## Scaffold types

| Item                | Produces                                    | Needed when                                    |
| ------------------- | ------------------------------------------- | ---------------------------------------------- |
| `model`             | CRUD model based on BaseModelClass          | the entity is read or written through the API  |
| `model_test`        | Test skeleton with `bootstrap(vi)` wiring   | you write Model tests for the entity           |
| `view_list`         | List view component                         | the entity has a list screen                   |
| `view_search_input` | Search input component                      | that list needs filtering                      |
| `view_form`         | Create/edit form component                  | the entity is created or edited through the UI |

`model` is what the rest of the stack derives from — generated services and the frontend calls that
consume them come from its `@api` methods. The `view_*` items are independent of one another, and
each is a re-run of the same command later, so scaffold the ones whose screens exist.

## CLI Scaffold Commands

All scaffold types can be generated via CLI (in addition to Sonamu UI):

```bash
pnpm sonamu scaffold model <entityId>
pnpm sonamu scaffold model_test <entityId>
pnpm sonamu scaffold view_list <entityId>
pnpm sonamu scaffold view_form <entityId>
```

`model_test` generates the test file skeleton (`{entity}.model.test.ts`) with the correct imports and `bootstrap(vi)` setup. Run it from `packages/api` after the entity's types.ts and migration are ready.

## Before scaffolding

Run from the `packages/api` directory:

1. Build, if you work from the CLI: `pnpm build`. Outside the dev server and tests, module
   loading resolves `dist/*.js` rather than `src/*.ts` (`runtimePath` in `utils/path-utils.ts`), and
   the config itself is loaded as `dist/sonamu.config.js` — so a CLI run without a build either
   fails to find the config or does not see source-only changes. A running `pnpm dev` sets
   `HOT=yes`, which switches both to `src`.
2. Sync generated output: `pnpm sonamu sync` — the templates read the entity's `types.ts` and
   `sonamu.generated.ts`. A running `pnpm dev` syncs automatically through its watcher.
3. Create and run the migration: from Sonamu UI, or `pnpm sonamu migrate generate` then
   `pnpm sonamu migrate run`

## What scaffolded output leaves incomplete

Scaffolding emits code that does not compile on its own in three cases. Each is a type error, so a
build surfaces all of them at once.

- OrderBy enums beyond `id-desc` — only the first value gets a branch, and `exhaustive()` rejects
  the rest (see "exhaustive() Type Error" below)
- Nullable props in `SaveParams` — the generated `types.ts` marks only `id` and `created_at` as
  `partial`, so a form that omits a nullable field is a type error (see "Expected types.ts shape"
  below)
- Relation labels — the form template looks up `entity.{EntityId}.{relation}_id`, while
  `sd.generated.ts` emits `entity.{EntityId}.{relation}` without the suffix (see "i18n Key Error"
  below). Registering labels is covered by the `sonamu-i18n` skill.

## Common Errors

| Error                                       | Cause                                                 | Fix                                        |
| ------------------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| "Non-existent module path requested {Type}" | types.ts not created or not compiled                  | Wait/create manually → build → restart dev |
| exhaustive() type error                     | Only the first OrderBy value is handled automatically | See "exhaustive() Type Error" below        |
| Missing i18n key (relation)                 | `author_id` vs `author`                               | See "i18n Key Error" below                 |
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

Auto-generation conditions:

- When `parentId` is absent (top-level entity)
- When the `types.ts` file does not yet exist

Causes of errors:

- No sync has run since the entity was created, so `types.ts` does not exist yet
- The entity has a `parentId`, so `types.ts` is never generated for it — child entities are typed
  through their parent
- `types.ts` exists but the build has not run, so the `.js` file the CLI resolves is missing

Resolution order (run from `packages/api`):

1. `pnpm sonamu sync` (or `--force` if output looks inconsistent)
2. If `types.ts` is still absent, check whether the entity has a `parentId` — that is by design, not
   a failure
3. Create the migration (Sonamu UI or `pnpm sonamu migrate generate`) and run it
   (`pnpm sonamu migrate run`)
4. `pnpm build`
5. Retry scaffolding

### Expected types.ts shape

Sync generates this file and never overwrites it afterwards, so extending it is your job. Write it
by hand only to add to it — substituting a hand-written file for a sync drifts from the template:

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

Every nullable prop needs the same treatment as `id` and `created_at`, plus `.nullish()` through
`extend` — `partial` alone gives `T | null | undefined` on read but still rejects an omitted key on
write. `updated_at` is the one that catches everyone: the scaffolded form has no input for it, so a
required `updated_at` makes every submit a type error.

```typescript
export const PostSaveParams = PostBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true, // no form input exists for it
  category: true, // nullable
  description: true, // nullable
}).extend({
  updated_at: z.date().nullish(),
  category: z.string().nullish(),
  description: z.string().nullish(),
});
```

`sonamu-testing`'s `references/type-safety.md` covers the `partial` + `extend` + `nullish` rules in
full.

### exhaustive() Type Error

`exhaustive` is a utility function provided by sonamu.

```typescript
import { exhaustive } from "sonamu";
```

The scaffolding template only handles the first value of the `OrderBy` enum automatically.

```typescript
// Generated code
if (params.orderBy === "id-desc") {
  qb.orderBy("posts.id", "desc");
} else {
  exhaustive(params.orderBy); // remaining cases unhandled → type error
}
```

Fix: Manually add all OrderBy cases

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
However, the scaffolded form.tsx template uses the FK column name `author_id`.

```typescript
// Scaffolded form.tsx (actually generated code)
{SD("entity.Post.author_id")}  // ← uses _id suffix

// sd.generated.ts (auto-generated keys)
"entity.Post.author": "Author"  // ← no _id
```

Fix (choose one):

1. Manually add `_id` key to ko.ts (recommended):

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

2. Remove `_id` from form.tsx (requires manual edit):

```typescript
// Manual edit after scaffolding
{
  SD("entity.Post.author");
} // remove _id
```

Recommended: First option - add the `_id` key to ko.ts. It is preserved during sync and can be reused across multiple forms.

### IdAsyncSelect API Migration

#### Background

When the `@sonamu-kit/react-components` package was updated, the IdAsyncSelect API changed, but the scaffolding generation code (`scaffolding/react-components.ts`) still generates code based on the old API.

Therefore, running `pnpm sonamu scaffold` generates wrapper components based on the old API, causing build errors in projects using the latest package.

#### Specific API Changes

Old API (code generated by scaffolding):

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

New API (actual package API):

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

1. Component name: `AsyncSelect` → `IdAsyncSelect<T>` (generic added)
2. Prop names:
   - `listParams` → `baseListParams`
   - `textField` → `displayField`
   - `pageField` removed
3. Search logic: external state management → internal handling (useState, useCallback, onSearch no longer needed)
4. Generic type: PK type must be specified explicitly (`<number>` or `<string>`)

#### Files That Need Updating

```
src/components/
  ├── user/UserIdAsyncSelect.tsx
  ├── account/AccountIdAsyncSelect.tsx
  ├── announcement/AnnouncementIdAsyncSelect.tsx
  └── ... (all *IdAsyncSelect.tsx files)
```

#### Migration Checklist

- Change component import: `AsyncSelect` → `IdAsyncSelect`
- Add generic type parameter: `<number>` or `<string>` (depending on PK type)
- Update Props type definitions:
  - `listParams` → `baseListParams`
  - `textField` → `displayField`
  - Remove `pageField`
- Remove manual state management:
  - Remove `useState`, `useCallback`
  - Remove `onSearch` handler
- Update prop names in JSX:
  - `listParams={...}` → `baseListParams={...}`
  - `textField={...}` → `displayField={...}`
  - Remove `pageField`
  - Remove `onSearch`

#### Why does this happen?

This occurs when the scaffolding generation code in Sonamu has not been updated to reflect the latest package API, while the user has modified the local Sonamu source and the package has been updated but the scaffolding template has not.

Fix: Manually update the generated components according to the checklist above, or update the scaffolding template in the Sonamu core to use the latest API.
