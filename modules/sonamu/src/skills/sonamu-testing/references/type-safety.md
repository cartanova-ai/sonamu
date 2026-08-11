# TypeScript Type Safety in Tests

## TypeScript Type Safety

Treat the generated subset and the project-owned schemas as the current contract. Do not repair a
test type error with a cast until the called public signature and generated shape have been checked.

### Array Indexing and Nullability Guards

Whether `rows[0]` is typed as possibly undefined depends on the project's TypeScript settings.
Guarding the value produces a definite type without weakening the assertion:

```typescript
const { rows } = await UserModel.findMany("A", { num: 10, page: 1 });
const first = rows[0];

expect(first).toBeDefined();
if (first === undefined) throw new Error("조회 결과가 비어 있다");
expect(first.username).toBe("tester");
```

Optional chaining is appropriate when `undefined` is an acceptable result. It is not a substitute
for an existence assertion when the test requires a row.

### Recommended Patterns

- Guard IDs returned from array-shaped save results before using them as definite IDs.
- Use `assert(value)` or an explicit `undefined` branch when the test requires existence.
- Keep expected objects typed with `satisfies` when that helps prevent literal widening.
- Import generated enums rather than duplicating valid string values.

### General Rules

Use `find()`/array guards according to the behavior being asserted. Avoid `?? 0` as a type-only
workaround: it can turn "save returned no ID" into an unrelated not-found query.

## Model Basic Methods (Test Targets)

Generated model signatures vary by entity and Sonamu version. Inspect the model/types in the
consumer project before writing the call; common shapes include:

```typescript
await Model.findById("A", id);
await Model.findMany("A", params);
await Model.save([params]);
await Model.del([id]);
```

Do not infer return nullability or parameter order from an older test file when the current generated
declaration is available.

## Type Safety Notes

### Zod Import Method

Use a value import when code calls `z.object`, `z.infer` through the namespace, or another Zod
runtime member:

```typescript
import { z } from "zod";
```

An `import type` is erased. It is only valid when the imported name is used exclusively in type
positions supported by the project's compiler.

### Checking partial Settings in SaveParams

`SaveParams` is project-owned and commonly defined in the entity's `*.types.ts` by transforming a
generated base schema. Its optional/default/nullish behavior—not database intuition—determines what
the test can pass to `save()`.

### Nullable Field Handling Pattern

Do not change production schemas merely to make a guessed test object compile. First distinguish:

- database-nullable: the stored value may be `null`;
- optional input: the key may be omitted;
- defaulted input: the parser or DB supplies a value;
- relation subset: reads expose an object while saves usually accept an FK field.

If the production input contract is genuinely wrong, that is a separate schema change with its own
behavioral validation.

### Use Nullish Coalescing

Use `??` only when the fallback is meaningful domain behavior. For required generated IDs, assert
existence instead of querying a sentinel ID.

### SaveParams Import Location

Import the save type/schema from the entity's current `*.types.ts` (or its public project barrel when
one exists). `sonamu.generated.ts` provides generated base/subset contracts; it does not universally
own each project's transformed `SaveParams`.
