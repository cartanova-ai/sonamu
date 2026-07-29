---
name: sonamu-frontend
description: Builds the Sonamu web frontend against generated services. Use when calling a generated Service, wiring a TanStack Query hook, building a form or list view, or when a scaffolded view fails to compile. Covers useTypeForm, useListParams, useSelection, IdAsyncSelect, FileInput, EnumSelect, SonamuProvider, and sonamu scaffold.
---

# Frontend Service

## Quick Reference

### Hooks

| Hook            | Purpose                           | Key Return Values                                |
| --------------- | --------------------------------- | ------------------------------------------------ |
| `useTypeForm`   | Form state management (Zod-based) | form, setForm, register, submit, addError, reset |
| `useListParams` | URL-synced list parameters        | listParams, setListParams, register              |
| `useSelection`  | Checkbox multi-selection          | selectedKeys, toggle, selectAll, deselectAll     |
| `useModal`      | Modal state management            | open, modal                                      |
| `useToast`      | Toast notifications               | toast                                            |

### Components

| Component     | Purpose          | Key Props                                           |
| ------------- | ---------------- | --------------------------------------------------- |
| `Input`       | Text input       | value, onValueChange                                |
| `Textarea`    | Multi-line input | value, onValueChange                                |
| `Checkbox`    | Checkbox         | value (boolean), onValueChange, label               |
| `Select`      | Single select    | items, value, onValueChange, placeholder, clearable |
| `MultiSelect` | Multi-select     | options, value (array), onValueChange, maxCount     |
| `EnumSelect`  | Enum select      | enum, labels, value, onValueChange                  |
| `FileInput`   | File upload      | uploadMode, viewMode, multiple, maxFiles            |

### Service (Auto-generated)

| Method            | Purpose              | Example                             |
| ----------------- | -------------------- | ----------------------------------- |
| `get{Entity}`     | Fetch single record  | `UserService.getUser("A", 123)`     |
| `get{Entities}`   | Fetch list           | `UserService.getUsers("P", params)` |
| `save`            | Save (create/update) | `UserService.save([data])`          |
| `del`             | Delete               | `UserService.del([1, 2, 3])`        |
| `use{Entity}`     | Single fetch hook    | `UserService.useUser("A", id)`      |
| `use{Entities}`   | List fetch hook      | `UserService.useUsers("P", params)` |
| `useSaveMutation` | Save mutation        | `UserService.useSaveMutation()`     |

### Utilities

| Function           | Purpose                  | Example                                           |
| ------------------ | ------------------------ | ------------------------------------------------- |
| `dateF`            | Date formatting          | `dateF(new Date())` → `"2024-01-15"`              |
| `datetimeF`        | Datetime formatting      | `datetimeF(new Date())` → `"2024-01-15 10:30:00"` |
| `numF`             | Number formatting        | `numF(1234567)` → `"1,234,567"`                   |
| `hidden`           | Conditional hidden class | `hidden(true)` → `"hidden"`                       |
| `arrayableToArray` | Convert to array         | `arrayableToArray("a")` → `["a"]`                 |

### Configuration

| Item             | Description                                        | Required                                   |
| ---------------- | -------------------------------------------------- | ------------------------------------------ |
| `SonamuProvider` | Global configuration Provider (uploader, auth, SD) | Required (uploader required for FileInput) |
| `uploader`       | File upload function                               | Required when using FileInput              |
| `auth`           | Authentication state and functions                 | Optional                                   |
| `SD`             | Internationalization function                      | Optional                                   |

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
const [userId] = await UserService.save([{ email: "new@test.com", username: "newuser" }]);

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


## Reference Map

| Need | Read |
| --- | --- |
| useTypeForm, useListParams, useSelection | `references/hooks.md` |
| IdAsyncSelect, FileInput, Select, EnumSelect | `references/components.md` |
| SonamuProvider, utilities, error handling, SSR, initial setup, rules | `references/runtime.md` |
| Full worked component implementations | `references/examples.md` |
| Scaffold commands, pre/post checklists, scaffolding errors | `references/scaffolding.md` |
