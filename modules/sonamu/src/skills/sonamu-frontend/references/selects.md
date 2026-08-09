# Select Components

## `Select`

`Select` accepts primitive items or `{ value, label, disabled }` items. A custom object value also
requires `valueKey` so the component can produce stable string keys.

```tsx
<Select
  {...register("status")}
  items={[
    { value: "draft", label: "Draft" },
    { value: "published", label: "Published" },
  ]}
  clearable
/>
```

Set `multiple` for array values. Multi mode additionally supports `maxCount` and `hideSelectAll`.
`searchable` displays client-side filtering in synchronous mode. Low-level async mode requires
`async={true}` and an `onSearch` callback; use `IdAsyncSelect` rather than rebuilding that wiring for
an Entity lookup.

## `EnumSelect`

`EnumSelect` turns the enum's `options` into Select items and gets each label from the supplied
record:

```tsx
<EnumSelect
  {...register("status")}
  enum={ProjectStatus}
  labels={ProjectStatusLabel}
  clearable
/>
```

It filters an empty-string enum option before rendering. Set `multiple` when the form field is an
array. `textPrefix` is prepended to every mapped label.

## `IdAsyncSelect`

Use the generated `{Entity}AsyncIdConfig` directly. It carries the subset-key, subset-mapping,
list-params, and generated list-hook types:

```tsx
import { IdAsyncSelect } from "@sonamu-kit/react-components/components";
import { DepartmentAsyncIdConfig } from "@/services/services.generated";

<IdAsyncSelect
  config={DepartmentAsyncIdConfig}
  subset="A"
  displayField="name"
  clearable
  {...register("department_id")}
/>
```

Do not write `<IdAsyncSelect<number>>` or `<IdAsyncSelect<string>>`. The first generic parameter is
the subset-key type, not the value type. `AsyncIdConfig` does not encode the primary-key value type;
`TValue` is inferred separately from typed `value` and `onValueChange` props.

`valueField` defaults to `id`. When `displayField` is omitted, the component tries `name`, `title`,
`label`, `display_name`, and `username`, then the first non-id string field, and finally `id`.
`displayField` may also be a callback receiving the selected subset row. `onRowChange` returns the
selected row or rows alongside `onValueChange`'s ids.

## When the list fetches

Without a keyword, the result list starts enabled only when one of these is true:

- `preload` is true;
- `baseListParams` contains a meaningful filter other than search, ordering, paging, or query mode;
- multi mode already has selected values.

Typing a non-empty keyword enables the infinite list query. A selected value that is not in the
current rows is fetched separately by id so its label can still render. Therefore an undefined
`baseListParams` does not mean the component can never fetch.

`preload` and meaningful base filters make the component a dropdown: rows load immediately and the
search field is hidden by default. Otherwise the search field is shown by default. An explicit
`searchable` prop overrides that display choice; the data still comes from the server-side infinite
query.

## Cascading filters

Pass a non-empty parent selection through `baseListParams`. It creates a different generated query
key and enables the list query for that filter. The component does not clear a child value when its
parent changes, so clear dependent fields in the parent's handler:

```tsx
<IdAsyncSelect
  config={DepartmentAsyncIdConfig}
  subset="A"
  {...register("department_id")}
  onValueChange={(departmentId) => {
    setForm((prev) => ({
      ...prev,
      department_id: departmentId ?? null,
      employee_id: null,
    }));
  }}
/>

<IdAsyncSelect
  config={EmployeeAsyncIdConfig}
  subset="A"
  baseListParams={form.department_id ? { department_id: form.department_id } : undefined}
  disabled={!form.department_id}
  {...register("employee_id")}
/>
```
