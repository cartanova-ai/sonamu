---
name: sonamu-frontend
description: Connects React screens to Sonamu generated clients and components. Use when consuming services.generated.ts, wiring generated TanStack Query helpers, configuring SonamuProvider, building forms or lists with useTypeForm or useListParams, using IdAsyncSelect or FileInput, or repairing view_list or view_form output. Covers AsyncIdConfig, queryOptions, useSelection, EnumSelect, and uploader.
---

# Sonamu Frontend

`services.generated.ts` is the frontend boundary of each decorated Model or Frame method. Its
request functions, query helpers, mutation hooks, parameter types, and return types are generated
from the endpoint decorator; inspect that generated namespace instead of assuming every Service has
the scaffolded CRUD names.

Do not edit `services.generated.ts`. A later sync replaces it. Change the Model decorator or its
types, run `pnpm sonamu sync`, and consume the regenerated surface.

## Standard generated surface

The scaffolded CRUD Model generates a namespace shaped like this when its decorators include the
matching clients:

```typescript
await ProjectService.getProject("A", projectId);
await ProjectService.getProjects("P", { page: 1, num: 20 });

const projectQuery = ProjectService.useProject("A", projectId!, {
  enabled: projectId !== undefined,
});
const projectsQuery = ProjectService.useProjects("P", { page: 1, num: 20 });

const saveMutation = ProjectService.useSaveMutation();
saveMutation.mutate({ spa: [form] });
```

The subset argument is present only when the underlying method declares one. It chooses the
generated response shape; it is not a universal argument added to every endpoint.

## Reference map

| Task | Read |
| --- | --- |
| Direct calls, generated hooks, query keys, mutations, frontend errors | `references/generated-services.md` |
| `useTypeForm`, field binding, `FileInput`, eager and lazy upload | `references/forms.md` |
| `useListParams`, URL search state, `useSelection` | `references/lists.md` |
| `Select`, `EnumSelect`, `IdAsyncSelect`, cascade filters | `references/selects.md` |
| `SonamuProvider`, `authOptions`, typed `SD`, uploader configuration | `references/provider.md` |
| `view_list` and `view_form` output or compile failures | `references/scaffolded-views.md` |
