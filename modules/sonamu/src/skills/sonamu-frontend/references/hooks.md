# Form and List Hooks

## useTypeForm

Type-safe form management based on Zod schemas (react-components v0.1.8+)

### Return Values

```typescript
const { form, setForm, register, submit, addError, removeError, clearError, reset } = useTypeForm(
  Schema,
  defaultValue,
);
```

| Return Value  | Type                                                | Description                       |
| ------------- | --------------------------------------------------- | --------------------------------- |
| `form`        | `z.infer<Schema>`                                   | Current form data                 |
| `setForm`     | `React.Dispatch<SetStateAction<...>>`               | Form state update function        |
| `register`    | `(field: string) => RegisterReturn`                 | Field registration function       |
| `submit`      | `(callback) => () => Promise<R>`                    | Submit handler factory            |
| `addError`    | `(path: string, error: string \| ErrorObj) => void` | Manually add an error             |
| `removeError` | `(path: string) => void`                            | Remove error for a specific field |
| `clearError`  | `() => void`                                        | Clear all errors                  |
| `reset`       | `() => void`                                        | Reset form to defaultValue        |

### register Return Object

```typescript
register(fieldName) // Returns:
{
  value: any,                           // Current field value
  onValueChange: (value: any) => void,  // Value change handler
  error?: { content: string }           // Error object (if present)
}
```

### Basic Usage

```tsx
import { useTypeForm } from "@sonamu-kit/react-components/lib";
import { Input } from "@sonamu-kit/react-components/components";
import { UserSaveParams } from "@/services/user/user.types";

function RegisterForm() {
  const { form, setForm, register, submit } = useTypeForm(UserSaveParams, {
    email: "",
    username: "",
    password: "",
  });

  const handleSubmit = submit(async (form) => {
    await UserService.save([form]);
  });

  // Method 1: spread operator (recommended)
  const emailProps = register("email");

  return (
    <form>
      <Input {...emailProps} />
      {emailProps.error && <span className="error">{emailProps.error.content}</span>}

      {/* Method 2: inline (for short cases) */}
      <Input {...register("username")} />
      {register("username").error && (
        <span className="error">{register("username").error.content}</span>
      )}

      <button onClick={handleSubmit}>Register</button>
    </form>
  );
}
```

### react-components UI components

All UI components in react-components follow the `value/onValueChange` pattern:

```tsx
import { Input, Checkbox, Select, Textarea } from "@sonamu-kit/react-components/components";

// Input (string)
<Input {...register("email")} />

// Textarea (string)
<Textarea {...register("content")} />

// Checkbox (boolean)
<Checkbox {...register("agreed")} />

// Select (using items prop)
<Select
  {...register("status")}
  items={[
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" }
  ]}
  placeholder="Select status"
/>

// Select simple form (string[] | number[])
<Select
  {...register("priority")}
  items={["high", "medium", "low"]}
  placeholder="Priority"
/>
```

Select component key props:

- `items`: Array of selectable items (`V[]` or `{ value: V, label?: ReactNode, disabled?: boolean }[]`)
- `placeholder`: Text shown before selection
- `clearable`: Whether the X button can deselect
- `renderItem`: Custom render function

### Initial values for required form fields

Fields defined as required in SaveParams must be included in the form initial values:

| Type              | Initial Value                  |
| ----------------- | ------------------------------ |
| string (required) | `""`                           |
| number (required) | `0`                            |
| Date (required)   | `new Date()`                   |
| enum (required)   | Default value (e.g. `"draft"`) |
| FK (required)     | `0`                            |
| nullable          | `null`                         |

```typescript
const { form, setForm, register } = useTypeForm(TaskSaveParams, {
  title: "", // string required
  status: "draft", // enum required
  budget: 0, // number required
  begin_date: new Date(), // Date required
  description: null, // nullable
  institution_id: 0, // FK required
});
```

### Accessing relation objects when loading data

If a scaffolded form accesses relation objects like `row.collection?.id`, that relation must be included in subset A.

Error: `Property 'collection' does not exist on type` → Add `"collection.id"` to subset A in entity.json

```json
// question.entity.json > subsets > A
["id", "content", "collection.id", "collection.title", "parent.id", "answer_group.id"]
```

Alternative: If the FK is already on `row`, using `...row` alone is sufficient without accessing the relation (no subset modification needed)

### SD() translation keys for FK fields

Scaffolded forms use `SD("entity.Task.institution_id")`, but `sd.generated.ts` only generates keys without `_id`.

Fix: Manually add the `_id` key to `ko.ts`

```typescript
// packages/api/src/i18n/ko.ts
"entity.Task.institution_id": "Institution",
"entity.Question.collection_id": "Collection",
```

Since `ko.ts` is copied from api → web, you only need to add it once.

## useListParams

List parameter management synchronized with URL query parameters (pagination, filtering)

```typescript
import { useListParams } from "@sonamu-kit/react-components/lib";
import { z } from "zod";

const ListParamsSchema = z.object({
  page: z.coerce.number().default(1),
  num: z.coerce.number().default(20),
  search: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

function UserListPage() {
  const { listParams, setListParams, register } = useListParams(
    ListParamsSchema,
    { page: 1, num: 20 }
  );

  const { data } = UserService.useUsers("P", listParams);

  return (
    <div>
      {/* Search (resets page=1 on change) */}
      <Input {...register("search")} placeholder="Search" />

      {/* Filter (resets page=1 on change) */}
      <Select {...register("status")} items={["active", "inactive"]} />

      {/* Pagination (changes page only) */}
      <button onClick={() => setListParams({ ...listParams, page: listParams.page - 1 })}>
        Previous
      </button>
      <span>Page {listParams.page}</span>
      <button onClick={() => setListParams({ ...listParams, page: listParams.page + 1 })}>
        Next
      </button>
    </div>
  );
}
```

Key points:

- Automatically syncs with URL (`?page=2&status=active`)
- `register` automatically resets page to 1 when any field other than page changes
- Type safety guaranteed by Zod schema

## useSelection

Checkbox multi-selection management (supports Shift-click range selection)

```typescript
import { useSelection } from "@sonamu-kit/react-components/lib";

function UserListPage() {
  const { data } = UserService.useUsers("P", { num: 20, page: 1 });
  const userIds = data?.rows.map(row => row.id) ?? [];

  const {
    getSelected,
    toggle,
    selectedKeys,
    selectAll,
    deselectAll,
    isAllSelected,
    handleCheckboxClick
  } = useSelection(userIds);

  const handleDelete = async () => {
    await UserService.del(selectedKeys);
    deselectAll();
  };

  return (
    <div>
      <Checkbox
        value={isAllSelected}
        onValueChange={isAllSelected ? deselectAll : selectAll}
        label="Select all"
      />
      <button onClick={handleDelete} disabled={selectedKeys.length === 0}>
        Delete selected ({selectedKeys.length})
      </button>

      {data?.rows.map((user, index) => (
        <div key={user.id} onClick={(e) => handleCheckboxClick(e, index)}>
          <Checkbox
            value={getSelected(user.id)}
            onValueChange={() => toggle(user.id)}
          />
          <span>{user.name}</span>
        </div>
      ))}
    </div>
  );
}
```

Key points:

- Range selection with Shift + click
- `selectedKeys`: Array of currently selected keys
- `isAllSelected`: Whether all items are selected
