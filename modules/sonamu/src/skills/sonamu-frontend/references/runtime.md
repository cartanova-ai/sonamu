# Provider, Utilities, Error Handling, SSR

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
  preload: (params) => [UserService.me(), CompanyService.findById("A", Number(params.companyId))],
});
```

## Project Name Change

After generating the project, you need to replace the "Sonamu" text in the frontend with your project name.

**4 files to update:**

1. **`packages/web/index.html`** - Browser tab title

```html
<title>{project-name}</title>
```

2. **`packages/web/src/routes/__root.tsx`** - TanStack Router head configuration (most important!)

```typescript
head: () => ({
  meta: [{ title: "{project-name}" }],
}),
```

**Important:** If you don't update `__root.tsx`, the title will revert to "Sonamu" on HMR!

3. **`packages/web/src/routes/index.tsx`** - Main page title

```tsx
<h1 className="text-2xl font-bold mb-4">Welcome to {project - name}</h1>
```

4. **`packages/web/src/components/Sidebar.tsx`** - Sidebar app name

```typescript
const title = isAdmin ? "Admin" : "{project-name}";
```

**How to verify:**

- Check that the project name is shown in the browser tab
- Confirm that the tab title does not change on file save via HMR (if it does, `__root.tsx` is missing)

---

## Rules

- NEVER manually modify `services.generated.ts`
- MUST specify Subset parameter when calling APIs
- Use `Promise.all([...])` for parallel requests

---
