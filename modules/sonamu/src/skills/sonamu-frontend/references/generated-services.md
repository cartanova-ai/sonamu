# Generated Services

## Names come from the endpoint

`services.generated.ts` contains one namespace per Model or Frame. A regular HTTP or upload endpoint
generates a request function. The decorator's `clients` decide which additional frontend entry
points exist:

| Client | Additional generated entry point |
| --- | --- |
| `tanstack-query` | `{method}QueryOptions` and a `use{Resource}` query hook |
| `tanstack-mutation` | `use{Method}Mutation` |
| `tanstack-mutation-multipart` | A mutation hook accepting `files` plus endpoint params when declared |

`@stream` and `@websocket` take a separate generation path: they emit their SSE or WebSocket hook
and do not emit a request function. Their runtime contract belongs to `sonamu-api`.

The query hook name uses `resourceName` when one is configured; the request function and query
options keep the generated method name. Read the namespace when consuming a custom endpoint rather
than deriving a hook name by hand.

The scaffolded `findById` and `findMany` methods use singular and plural resource names, producing a
surface such as:

```typescript
ProjectService.getProject("A", projectId);
ProjectService.getProjectQueryOptions("A", projectId);
ProjectService.useProject("A", projectId);

ProjectService.getProjects("P", listParams);
ProjectService.getProjectsQueryOptions("P", listParams);
ProjectService.useProjects("P", listParams);
ProjectService.useProjectsInfinite("P", listParams);
```

The infinite query helper requires all three conditions: `clients` includes `tanstack-query`, the
underlying method name is exactly `findMany`, and `resourceName` exists and is plural.

For the standard `findMany(subset, rawParams)` shape, each request spreads `rawParams` and replaces
its `page` with the next page number. The generator only rewrites a parameter literally named
`rawParams`; a differently named list-params parameter is passed unchanged, so the helper does not
apply its page number. It stops when the loaded row count reaches `total` and exposes flattened
`rows` and `total` on its data.

## Query state and conditional fetching

Generated query hooks accept only an `enabled` option in addition to the endpoint parameters:

```typescript
const query = ProjectService.useProject("A", projectId!, {
  enabled: projectId !== undefined,
});
```

They return the TanStack Query result plus:

- `refresh()`: awaits a manual refetch.
- `isRefreshing`: true only while that `refresh()` call is in progress, independently of the
  query's general `isFetching` state.

## Query keys and invalidation

Generated keys use the generated request method name, not the server Model method name:

```typescript
ProjectService.getProjectQueryOptions("A", projectId).queryKey;
// ["Project", "getProject", "A", projectId]

ProjectService.getProjectsQueryOptions("P", listParams).queryKey;
// ["Project", "getProjects", "P", listParams]
```

Prefer the generated query-options function when invalidating one exact request:

```typescript
await queryClient.invalidateQueries({
  queryKey: ProjectService.getProjectQueryOptions("A", projectId).queryKey,
});
```

Invalidate the namespace prefix when every query for the entity is stale:

```typescript
await queryClient.invalidateQueries({ queryKey: ["Project"] });
```

## Mutations

A generated mutation receives one object whose keys are the endpoint parameters other than
framework Context parameters:

```typescript
const saveMutation = ProjectService.useSaveMutation();
const ids = await saveMutation.mutateAsync({ spa: [form] });

const deleteMutation = ProjectService.useDelMutation();
deleteMutation.mutate({ ids: selectedIds });
```

The direct request functions keep positional parameters (`save([form])`, `del(selectedIds)`).
For a multipart mutation, `files` is required, and the generated `params` field is also required
when the endpoint declares parameters; required endpoint params do not become optional.

## Frontend errors

Generated requests turn an HTTP error response into `SonamuError`. Import the guard from the
generated shared service module:

```typescript
import { isSonamuError } from "@/services/sonamu.shared";

try {
  await ProjectService.save([form]);
} catch (error) {
  if (isSonamuError(error)) {
    for (const issue of error.issues ?? []) {
      console.error(issue.path, issue.message);
    }
  }
}
```

`code` is the response status. A validation response supplies `issues`; an ordinary server error can
omit it at runtime, so guard it before iterating. `defaultCatch` from the same module is the generated
alert-based fallback.
