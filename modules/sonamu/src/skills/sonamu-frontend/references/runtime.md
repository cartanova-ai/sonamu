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

## Initial Project Setup

**→ See the "Project Name Change" section in `sonamu-init`** (change 4 files: index.html, \_\_root.tsx, index.tsx, Sidebar.tsx)

## Rules

- NEVER manually modify `services.generated.ts`
- MUST specify Subset parameter when calling APIs
- Use `Promise.all([...])` for parallel requests

---
