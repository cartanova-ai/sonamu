---
name: sonamu-frontend
description: Sonamu frontend integration. Auto-generated Service, TanStack Query hooks, useTypeForm/useListParams/useSelection, FileInput, MultiSelect, SonamuProvider (react-components v0.1.8+). Use when calling APIs, building forms, handling file uploads, or managing list/selection states.
---

# Frontend Service

## Quick Reference

### Hooks

| Hook            | Purpose                              | Key Return Values                                        |
| --------------- | ------------------------------------ | -------------------------------------------------------- |
| `useTypeForm`   | Form state management (Zod-based)    | form, setForm, register, submit, addError, reset |
| `useListParams` | URL-synced list parameters           | listParams, setListParams, register              |
| `useSelection`  | Checkbox multi-selection             | selectedKeys, toggle, selectAll, deselectAll     |
| `useModal`      | Modal state management               | open, modal                                      |
| `useToast`      | Toast notifications                  | toast                                            |

### Components

| Component     | Purpose              | Key Props                                           |
| ------------- | -------------------- | --------------------------------------------------- |
| `Input`       | Text input           | value, onValueChange                                |
| `Textarea`    | Multi-line input     | value, onValueChange                                |
| `Checkbox`    | Checkbox             | value (boolean), onValueChange, label               |
| `Select`      | Single select        | items, value, onValueChange, placeholder, clearable |
| `MultiSelect` | Multi-select         | options, value (array), onValueChange, maxCount     |
| `EnumSelect`  | Enum select          | enum, labels, value, onValueChange                  |
| `FileInput`   | File upload          | uploadMode, viewMode, multiple, maxFiles            |

### Service (Auto-generated)

| Method            | Purpose                  | Example                                |
| ----------------- | ------------------------ | -------------------------------------- |
| `get{Entity}`     | Fetch single record      | `UserService.getUser("A", 123)`        |
| `get{Entities}`   | Fetch list               | `UserService.getUsers("P", params)`    |
| `save`            | Save (create/update)     | `UserService.save([data])`             |
| `del`             | Delete                   | `UserService.del([1, 2, 3])`           |
| `use{Entity}`     | Single fetch hook        | `UserService.useUser("A", id)`         |
| `use{Entities}`   | List fetch hook          | `UserService.useUsers("P", params)`    |
| `useSaveMutation` | Save mutation            | `UserService.useSaveMutation()`        |

### Utilities

| Function           | Purpose                      | Example                                              |
| ------------------ | ---------------------------- | ---------------------------------------------------- |
| `dateF`            | Date formatting              | `dateF(new Date())` → `"2024-01-15"`              |
| `datetimeF`        | Datetime formatting          | `datetimeF(new Date())` → `"2024-01-15 10:30:00"` |
| `numF`             | Number formatting            | `numF(1234567)` → `"1,234,567"`                   |
| `hidden`           | Conditional hidden class     | `hidden(true)` → `"hidden"`                       |
| `arrayableToArray` | Convert to array             | `arrayableToArray("a")` → `["a"]`                 |

### Configuration

| Item             | Description                                      | Required                                  |
| ---------------- | ------------------------------------------------ | ----------------------------------------- |
| `SonamuProvider` | Global configuration Provider (uploader, auth, SD) | Required (uploader required for FileInput) |
| `uploader`       | File upload function                             | Required when using FileInput             |
| `auth`           | Authentication state and functions               | Optional                                  |
| `SD`             | Internationalization function                    | Optional                                  |

---

# Frontend Service

## Basic Usage

```typescript
import { UserService } from "@/services/services.generated";

// Single fetch (Subset required) - get{Entity} form
const user = await UserService.getUser("A", 123);

// List fetch - get{Entities} form
const { rows, total } = await UserService.getUsers("P", { num: 20, page: 1 });

// Save
const [userId] = await UserService.save([
  { email: "new@test.com", username: "newuser" },
]);

// Delete
const count = await UserService.del([1, 2, 3]);
```

## TanStack Query Hook

### useQuery

```typescript
function UserProfile({ userId }: { userId: number }) {
  // use{Entity} form (single), use{Entities} form (list)
  const { data: user, isLoading, error } = UserService.useUser("A", userId);

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <h1>{user?.username}</h1>;
}
```

### useMutation

```typescript
function EditProfile() {
  const saveMutation = UserService.useSaveMutation();

  async function handleSubmit(data: UserSaveParams) {
    saveMutation.mutate({ spa: [data] }, {
      onSuccess: ([userId]) => console.log("Saved:", userId),
      onError: (error) => console.error("Failed:", error),
    });
  }

  return <button disabled={saveMutation.isPending}>Save</button>;
}
```

### Conditional Fetching

```typescript
const { data } = UserService.useUser("A", userId!, {
  enabled: userId !== null,
});
```

### Cache Invalidation

```typescript
const queryClient = useQueryClient();
queryClient.invalidateQueries({ queryKey: ["User", "findById", "A", userId] });
```

## useTypeForm

Type-safe form management based on Zod schemas (react-components v0.1.8+)

### Return Values

```typescript
const {
  form,
  setForm,
  register,
  submit,
  addError,
  removeError,
  clearError,
  reset,
} = useTypeForm(Schema, defaultValue);
```

| Return Value  | Type                                                | Description                              |
| ------------- | --------------------------------------------------- | ---------------------------------------- |
| `form`        | `z.infer<Schema>`                                   | Current form data                        |
| `setForm`     | `React.Dispatch<SetStateAction<...>>`               | Form state update function               |
| `register`    | `(field: string) => RegisterReturn`                 | Field registration function              |
| `submit`      | `(callback) => () => Promise<R>`                    | Submit handler factory                   |
| `addError`    | `(path: string, error: string \| ErrorObj) => void` | Manually add an error                    |
| `removeError` | `(path: string) => void`                            | Remove error for a specific field        |
| `clearError`  | `() => void`                                        | Clear all errors                         |
| `reset`       | `() => void`                                        | Reset form to defaultValue               |

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
      {emailProps.error && (
        <span className="error">{emailProps.error.content}</span>
      )}

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

### IMPORTANT: react-components UI Component Usage

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

**Select component key props:**

- `items`: Array of selectable items (`V[]` or `{ value: V, label?: ReactNode, disabled?: boolean }[]`)
- `placeholder`: Text shown before selection
- `clearable`: Whether the X button can deselect
- `renderItem`: Custom render function

### IMPORTANT: Form Required Field Initial Values

Fields defined as required in SaveParams **must be included** in the form initial values:

| Type              | Initial Value          |
| ----------------- | ---------------------- |
| string (required) | `""`                   |
| number (required) | `0`                    |
| Date (required)   | `new Date()`           |
| enum (required)   | Default value (e.g. `"draft"`) |
| FK (required)     | `0`                    |
| nullable          | `null`                 |

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

### IMPORTANT: Accessing Relation Objects When Loading Data

If a scaffolded form accesses relation objects like `row.collection?.id`, that relation must be included in subset A.

**Error**: `Property 'collection' does not exist on type` → Add `"collection.id"` to subset A in entity.json

```json
// question.entity.json > subsets > A
[
  "id",
  "content",
  "collection.id",
  "collection.title",
  "parent.id",
  "answer_group.id"
]
```

**Alternative**: If the FK is already on `row`, using `...row` alone is sufficient without accessing the relation (no subset modification needed)

### IMPORTANT: SD() Translation Key for FK Fields

Scaffolded forms use `SD("entity.Task.institution_id")`, but `sd.generated.ts` only generates keys without `_id`.

**Fix**: Manually add the `_id` key to `ko.ts`

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

**Key points:**

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

**Key points:**

- Range selection with Shift + click
- `selectedKeys`: Array of currently selected keys
- `isAllSelected`: Whether all items are selected

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

**Key Props:**

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

**Key behavior**: When the `baseListParams` prop changes, the React Query inside `IdAsyncSelect` automatically re-fetches with the new parameters. (Bug fixed in v0.2.5+ — previous versions only used the initial value and did not reflect changes)

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

**Notes**:
- You must explicitly reset lower values to `null` when a higher-level value changes. IdAsyncSelect does not reset automatically.
- Using the `disabled` prop to disable lower levels when the parent is not selected improves UX.
- If `baseListParams` is `undefined`, IdAsyncSelect stays in enabled=false state and does not fetch.

**Items to specify in Spec** (recommended to add to acceptanceCriteria in spec.json when cascade is present):
```json
"acceptanceCriteria": [
  "When a department is selected, only divisions belonging to that department appear in the dropdown",
  "When a division is selected, only labs belonging to that division appear in the dropdown",
  "When the department changes, the lower division/lab selections are reset"
]
```

### IMPORTANT: String Primary Key Support

Most Entities use Number PK (`IdAsyncSelect<number>`), but better-auth related Entities use String PK.

**String PK Entities**: User, Account, Session, Verification

**Points to change** (manual modification required after scaffolding):

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

**Props:**

- `uploadMode`: `"eager"` (upload immediately) | `"lazy"` (upload on submit)
- `viewMode`: `"image"` (image preview) | `"file"` (filename)
- `multiple`: Whether multiple files can be selected
- `maxFiles`: Maximum number of files
- `previewSize`: `"sm" | "md" | "lg" | "xl"`
- `clearable`: Whether the X button can remove the file

**IMPORTANT**: uploader function must be configured in SonamuProvider (see below)

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

**Multi-select specific Props:**

- `multiple`: `true` (enables multi-select)
- `maxCount`: Maximum number of badges to display
- `hideSelectAll`: Hide the select all button
- `searchable`: Enable search input

**Common Props:**

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

**Key points:**

- Zod enum type safety
- Display name mapping via labels object
- Automatically converts enum.options to items

## SonamuProvider

Global configuration used across react-components

```typescript
// App.tsx or root component
import { SonamuProvider } from "@sonamu-kit/react-components/contexts";
import type { SonamuFile } from "@sonamu-kit/react-components/contexts";

function App() {
  // File uploader function (used by FileInput, useTypeForm)
  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    const formData = new FormData();
    files.forEach(file => formData.append("files", file));

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    return response.json();
  };

  // Authentication state (optional)
  const auth = {
    user: currentUser,
    loading: isLoading,
    login: async (params) => { /* ... */ },
    logout: async () => { /* ... */ },
    refetch: async () => { /* ... */ },
  };

  // Internationalization function (optional)
  const SD = (key: string) => dictionary[key] ?? key;

  return (
    <SonamuProvider uploader={uploader} auth={auth} SD={SD}>
      {children}
    </SonamuProvider>
  );
}
```

**Required Props:**

- `uploader`: `(files: File[]) => Promise<SonamuFile[]>` - Used by FileInput
- `auth`: Authentication state and functions (optional)
- `SD`: Internationalization function (optional)

## Utility Functions

```typescript
import {
  dateF,
  datetimeF,
  numF,
  hidden,
  arrayableToArray,
  sqlDateToDateString,
} from "@sonamu-kit/react-components/lib";

// Date formatting
dateF(new Date());           // "2024-01-15"
dateF("2024-01-15T10:30:00"); // "2024-01-15"
datetimeF(new Date());       // "2024-01-15 10:30:00"

// Number formatting
numF(1234567);  // "1,234,567"

// Conditional hidden class
<div className={hidden(isHidden)}>...</div>

// SQL date → date string
sqlDateToDateString("2024-01-15T10:30:00.000Z");  // "2024-01-15"

// Convert to array
arrayableToArray("single");      // ["single"]
arrayableToArray(["a", "b"]);    // ["a", "b"]
arrayableToArray(undefined);     // []
```

## Error Handling

```typescript
import { isSonamuError } from "@/lib/sonamu.shared";

try {
  await UserService.save([
    {
      /* ... */
    },
  ]);
} catch (error) {
  if (isSonamuError(error)) {
    console.log("Status:", error.code);
    console.log("Message:", error.message);
    error.issues.forEach((issue) => {
      console.log(`${issue.path.join(".")}: ${issue.message}`);
    });
  }
}
```

## SSR

```typescript
// api/src/ssr/routes.ts
import { registerSSR } from "sonamu/ssr";

registerSSR({
  path: "/companies/:companyId",
  preload: (params) => [
    UserService.me(),
    CompanyService.findById("A", Number(params.companyId)),
  ],
});
```

## Initial Project Setup

**→ See the "Project Name Change" section in `create-sonamu.md`** (change 4 files: index.html, \_\_root.tsx, index.tsx, Sidebar.tsx)

## Rules

- NEVER manually modify `services.generated.ts`
- MUST specify Subset parameter when calling APIs
- Use `Promise.all([...])` for parallel requests

---

## Full Component Implementation Examples

### List Page

```typescript
function ConsultationListPage() {
  const [params, setParams] = useState({ num: 20, page: 1 });
  const { data, isLoading } = ConsultationService.useConsultations("P", params);

  return (
    <div>
      {/* Manage selection with useSelection */}
      {data?.rows.map((row) => (
        <div key={row.id}>{row.title} - {row.status}</div>
      ))}
      {/* Pagination: manipulate params.page */}
    </div>
  );
}
```

### Edit Page

```typescript
function ConsultationFormPage() {
  const { id } = useParams();
  const { form, setForm, register, submit } = useTypeForm(ConsultationSaveParams, {
    title: "", content: "", status: "pending", user_id: 0,
  });

  // Edit mode: load data
  useEffect(() => {
    if (id) ConsultationService.getConsultation("A", Number(id)).then((row) => setForm((prev) => ({ ...prev, ...row })));
  }, [id]);

  const saveMutation = ConsultationService.useSaveMutation();
  const handleSubmit = submit(async (form) => {
    const [cId] = await saveMutation.mutateAsync({ spa: [form] });
    navigate(`/consultations/${cId}`);
  });

  return (
    <form>
      <Input {...register("title")} />
      <Textarea {...register("content")} />
      <Select {...register("status")} items={[{value:"pending",label:"Pending"},{value:"completed",label:"Completed"}]} />
      <button onClick={handleSubmit} disabled={saveMutation.isPending}>Save</button>
    </form>
  );
}
```

### Cache Invalidation

```typescript
const queryClient = useQueryClient();
await ConsultationService.changeStatus(id, newStatus, "Status change");
queryClient.invalidateQueries({
  queryKey: ["Consultation", "findById", "A", id],
});
queryClient.invalidateQueries({ queryKey: ["Consultation", "findMany"] });
```
