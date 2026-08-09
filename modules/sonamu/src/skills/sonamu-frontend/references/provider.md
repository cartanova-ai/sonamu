# SonamuProvider

`SonamuProvider` supplies three optional integrations to react-components:

- `uploader(files, params?)` for eager `FileInput` and `useTypeForm.submit()`;
- `authOptions` to create a Better Auth React client, or `auth` to supply an existing client;
- `SD` for project and component dictionary keys.

The generated web application wraps this in a project-level provider:

```tsx
import {
  SonamuProvider as BaseSonamuProvider,
  type SonamuFile,
  useSonamuBaseContext,
} from "@sonamu-kit/react-components";
import type { BetterAuthClientOptions } from "better-auth/client";
import type { ReactNode } from "react";

import { type MergedDictionary, SD } from "@/i18n/sd.generated";
import { FileService } from "@/services/services.generated";

const authOptions = {
  plugins: [],
} satisfies BetterAuthClientOptions;

export function useSonamuContext() {
  return useSonamuBaseContext<MergedDictionary, typeof authOptions>();
}

export function SonamuProvider({ children }: { children: ReactNode }) {
  const uploadMutation = FileService.useUploadMutation();
  const uploader = async (files: File[]): Promise<SonamuFile[]> => {
    if (files.length === 0) return [];
    const result = await uploadMutation.mutateAsync({ files });
    return result.files;
  };

  return (
    <BaseSonamuProvider<MergedDictionary>
      authOptions={authOptions}
      uploader={uploader}
      SD={SD}
    >
      {children}
    </BaseSonamuProvider>
  );
}
```

This provider uses a generated mutation hook, so place it below `QueryClientProvider`. A provider
whose uploader does not use React Query has no such ordering dependency.

## Missing integrations

The Provider supplies built-in English labels for react-components when `SD` is omitted. It cannot
translate project dictionary keys; pass the generated `SD` and its `MergedDictionary` generic for
those keys and their function parameters to stay typed.

When `uploader` is omitted, the context installs a function that throws:

```text
[SonamuProvider] uploader is not configured. Please provide uploader configuration to SonamuProvider.
```

Forms without browser `File` values do not call that fallback. Eager file selection and lazy submit
do call it and fail the upload.

When `authOptions` is present, the Provider creates one Better Auth client and exposes it as `auth`.
Passing `auth` directly takes precedence. If neither is present, code that consumes `auth` has no
configured client; authentication setup and plugin alignment belong to the `sonamu-auth` skill.
