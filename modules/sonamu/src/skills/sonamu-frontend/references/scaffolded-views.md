# Scaffolded Views

Run the frontend view templates from the API package after the Entity types and generated API
surface are available:

```bash
pnpm sonamu scaffold view_list YourEntity
pnpm sonamu scaffold view_form YourEntity
```

`view_list` writes `web/src/routes/admin/{plural-fs-name}/index.tsx`; `view_form` writes `form.tsx`
in the same directory. Each command writes one view file and is independent of the other. Entity
creation order, migrations, Model scaffolding, and Model tests belong to `sonamu-entity`,
`sonamu-migration`, and `sonamu-testing`.

## Generated contracts

Both views use subset `A`. The list derives its displayed columns from that subset, and the form
loads its edit row with `get{Entity}("A", id)`. A relation field in the generated form reads the
relation object's `id`, so the form Entity's subset `A` must contain `{relation}.id` for edit
initialization.

`IdAsyncSelect` separately queries the related Entity through its AsyncIdConfig with that Entity's
subset `A`. Include the chosen `displayField` there, or include a supported fallback display field;
otherwise the component falls back to the related id as its label.

The form reads `{Entity}SaveParams` to choose controls and default values. It currently emits:

| SaveParams field | Component |
| --- | --- |
| `string-plain` with an explicit `maxLength` of 256 or less, or with no maximum | `Input` |
| `string-plain` with an explicit `maxLength` greater than 256 | `Textarea` |
| number | `Input` with `type="number"` |
| boolean | `Switch` |
| enum | `EnumSelect` |
| relation id or many-to-many id array | `IdAsyncSelect` |
| `SonamuFile` or `SonamuFile[]` | lazy `FileInput` |
| `datetime` | `DateInput` |
| `string-date` or `string-datetime` | `Input` through the default branch |

The template currently imports `DateInput` for all three date-like render types and generates helper
functions for `string-date` and `string-datetime`, but `renderColumn` maps only `datetime` to
`DateInput`; the string variants still fall through to `Input`.

The generated relation control passes the generated AsyncIdConfig directly and adds no explicit
generic. The config supplies subset-key, subset-mapping, and list-params types, not the id value
type; typed `value` and `onValueChange` props provide that `TValue` inference in handwritten uses.

Generated labels use the Entity relation name (`entity.Project.owner`), not its storage column name
(`entity.Project.owner_id`). Register custom wording in the API i18n source under the relation-name
key; translation generation belongs to `sonamu-i18n`.

## Failure routing

### `SaveParams for YourEntity not found. Did you run 'sonamu sync'?`

The form template could not load the exported Zod schema. Run `pnpm sonamu sync`. For a CLI process
that loads built API output, build the API after changing `types.ts`, then retry the scaffold.

### Relation property missing on subset `A`

If the generated form reads `row.owner?.id` but `owner` is absent from the returned type, add
`owner.id` to the form Entity's subset `A`, then sync before scaffolding again. Resolve label or
display-field issues in the related Entity's subset `A` as described above. Do not add `owner_id` to
a subset; subsets use relation field expressions while database indexes use column names.

### Generated Service or AsyncIdConfig missing

Those exports derive from decorated Model methods, not from the Entity alone. Scaffold or implement
the Model, ensure its `findMany` method includes the `tanstack-query` client and a plural
`resourceName`, then run `pnpm sonamu sync`. `AsyncIdConfig` is emitted only when Sonamu finds that
query surface.
