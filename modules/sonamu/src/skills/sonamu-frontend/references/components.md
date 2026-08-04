# Components

## IdAsyncSelect

Component for asynchronously searching and selecting Entity records. The generic type must be specified according to the Entity's Primary Key type.

### Basic Usage

IdAsyncSelect is typically used as a per-Entity wrapper component:

```typescript
import { IdAsyncSelect } from "@sonamu-kit/react-components/components";
import { UserAsyncIdConfig } from "@/services/services.generated";
import type { UserSubsetKey, UserSubsetMapping } from "@/services/sonamu.generated";
import type { UserListParams } from "@/services/user/user.types";

export type UserIdAsyncSelectProps<T extends UserSubsetKey> = {
  subset: T;
  baseListParams?: UserListParams;
  displayField?: keyof UserSubsetMapping[T] & string;
  valueField?: keyof UserSubsetMapping[T] & string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  multiple?: boolean;
  value?: number | number[] | null;  // Number PK
  onValueChange?: (value: number | number[] | undefined) => void;
};

export function UserIdAsyncSelect<T extends UserSubsetKey>({
  subset,
  value,
  onValueChange,
  baseListParams,
  displayField = "name",
  valueField = "id",
  placeholder = "User",
  clearable,
  disabled,
  className,
  multiple = false,
}: UserIdAsyncSelectProps<T>) {
  return (
    <IdAsyncSelect<number>  // Number PK
      config={UserAsyncIdConfig}
      subset={subset}
      baseListParams={baseListParams}
      displayField={displayField}
      valueField={valueField}
      placeholder={placeholder}
      clearable={clearable}
      disabled={disabled}
      className={className}
      multiple={multiple}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
```

Key Props:

- `config`: Auto-generated AsyncIdConfig (EntityAsyncIdConfig form)
- `subset`: Subset key to query
- `baseListParams`: List filter parameters
- `displayField`: Field name to display (default varies by Entity)
- `valueField`: Field name used as value (default: "id")
- `multiple`: Whether multi-selection is enabled
- `value`: Currently selected value (number or string depending on PK type)
- `onValueChange`: Value change handler

### Cascade Dropdown Pattern (Hierarchical Selection)

When lower-level lists should change based on higher-level selection (e.g. Department → Division → Lab), pass `baseListParams` dynamically.

Key behavior: When the `baseListParams` prop changes, the React Query inside `IdAsyncSelect` automatically re-fetches with the new parameters. (Bug fixed in v0.2.5+ — previous versions only used the initial value and did not reflect changes)

```tsx
// Example: 3-level cascade Department → Division → Lab
function UserForm() {
  const { form, register, setForm } = useTypeForm(UserSaveParams, {
    dept_id: null,
    division_id: null,
    lab_id: null,
  });

  return (
    <form>
      {/* Level 1: Department selection (full list → preload or default IdAsyncSelect) */}
      <DepartmentIdAsyncSelect
        subset="A"
        {...register("dept_id")}
        onValueChange={(v) => {
          // Reset lower values when department changes
          setForm((prev) => ({ ...prev, dept_id: v ?? null, division_id: null, lab_id: null }));
        }}
      />

      {/* Level 2: Division selection (only divisions in selected department) */}
      <DivisionIdAsyncSelect
        subset="A"
        baseListParams={form.dept_id ? { department_id: form.dept_id } : undefined}
        disabled={!form.dept_id}
        {...register("division_id")}
        onValueChange={(v) => {
          // Reset lab when division changes
          setForm((prev) => ({ ...prev, division_id: v ?? null, lab_id: null }));
        }}
      />

      {/* Level 3: Lab selection (only labs in selected division) */}
      <LabIdAsyncSelect
        subset="A"
        baseListParams={form.division_id ? { division_id: form.division_id } : undefined}
        disabled={!form.division_id}
        {...register("lab_id")}
      />
    </form>
  );
}
```

Notes:

- You must explicitly reset lower values to `null` when a higher-level value changes. IdAsyncSelect does not reset automatically.
- Using the `disabled` prop to disable lower levels when the parent is not selected improves UX.
- If `baseListParams` is `undefined`, IdAsyncSelect stays in enabled=false state and does not fetch.

Items to specify in Spec (recommended to add to acceptanceCriteria in spec.json when cascade is present):

```json
"acceptanceCriteria": [
  "When a department is selected, only divisions belonging to that department appear in the dropdown",
  "When a division is selected, only labs belonging to that division appear in the dropdown",
  "When the department changes, the lower division/lab selections are reset"
]
```

### String primary key support

Most Entities use Number PK (`IdAsyncSelect<number>`), but better-auth related Entities use String PK.

String PK Entities: User, Account, Session, Verification

Points to change (manual modification required after scaffolding):

```typescript
// Number PK (default)
value?: number | number[] | null;
onValueChange?: (value: number | number[] | undefined) => void;
<IdAsyncSelect<number> config={PostAsyncIdConfig} ... />

// String PK (User, Account, etc.) — change all 3 places to string
value?: string | string[] | null;
onValueChange?: (value: string | string[] | undefined) => void;
<IdAsyncSelect<string> config={AccountAsyncIdConfig} ... />
```

### Usage in Forms

```tsx
function PostForm() {
  const { form, setForm, register } = useTypeForm(PostSaveParams, {
    title: "",
    author_id: 0, // or "" for string PK
  });

  return (
    <form>
      <Input {...register("title")} />

      {/* Number PK */}
      <UserIdAsyncSelect subset="A" {...register("author_id")} />

      {/* String PK */}
      <AccountIdAsyncSelect subset="A" {...register("account_id")} />
    </form>
  );
}
```

## FileInput

File upload component (image/general files, eager/lazy modes)

```typescript
import { FileInput } from "@sonamu-kit/react-components/components";
import type { SonamuFile } from "@sonamu-kit/react-components/contexts";

function ProfileForm() {
  const { form, setForm, register, submit } = useTypeForm(ProfileSaveParams, {
    avatar: null,  // SonamuFile | File | null
    documents: [], // (SonamuFile | File)[]
  });

  return (
    <form>
      {/* Single image - eager upload */}
      <FileInput
        {...register("avatar")}
        uploadMode="eager"
        viewMode="image"
        placeholder="Profile image"
        accept="image/*"
        previewSize="md"
      />

      {/* Multiple files - lazy upload */}
      <FileInput
        {...register("documents")}
        uploadMode="lazy"
        viewMode="file"
        multiple
        maxFiles={5}
        placeholder="Attach documents"
      />

      <button onClick={submit(async (form) => {
        // lazy mode: auto-uploads on submit
        await ProfileService.save([form]);
      })}>Save</button>
    </form>
  );
}
```

Props:

- `uploadMode`: `"eager"` (upload immediately) | `"lazy"` (upload on submit)
- `viewMode`: `"image"` (image preview) | `"file"` (filename)
- `multiple`: Whether multiple files can be selected
- `maxFiles`: Maximum number of files
- `previewSize`: `"sm" | "md" | "lg" | "xl"`
- `clearable`: Whether the X button can remove the file

The component has no upload transport of its own — it calls the `uploader` function configured on
`SonamuProvider` (see below), so without it the file picker works and the upload does nothing.

## Select (Multi-select Mode)

Setting `multiple: true` on the `Select` component enables multi-select mode.

```typescript
import { Select } from "@sonamu-kit/react-components/components";

function TagForm() {
  const { register } = useTypeForm(PostSaveParams, {
    tag_ids: [],  // number[]
  });

  const items = [
    { value: 1, label: "JavaScript" },
    { value: 2, label: "TypeScript" },
    { value: 3, label: "React" },
    { value: 4, label: "Vue" },
  ];

  return (
    <Select
      {...register("tag_ids")}
      items={items}
      multiple
      placeholder="Select tags"
    />
  );
}
```

Multi-select specific Props:

- `multiple`: `true` (enables multi-select)
- `maxCount`: Maximum number of badges to display
- `hideSelectAll`: Hide the select all button
- `searchable`: Enable search input

Common Props:

- `items`: `SelectItemDef[]` (values only or `{ value, label, disabled }` form)
- `placeholder`: Text shown before selection
- `clearable`: X button to deselect all
- `disabled`: Disable the component
- `renderItem`: Custom render function
- `async`: When set to `true`, supports async search via `onSearch` callback

## EnumSelect

Select integrated with Zod enum (label mapping)

```typescript
import { EnumSelect } from "@sonamu-kit/react-components/components";
import { z } from "zod";

const StatusEnum = z.enum(["draft", "published", "archived"]);

const statusLabels = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
} as const;

function PostForm() {
  const { register } = useTypeForm(PostSaveParams, {
    status: "draft",
  });

  return (
    <EnumSelect
      {...register("status")}
      enum={StatusEnum}
      labels={statusLabels}
      placeholder="Select status"
      clearable
    />
  );
}
```

Key points:

- Zod enum type safety
- Display name mapping via labels object
- Automatically converts enum.options to items
