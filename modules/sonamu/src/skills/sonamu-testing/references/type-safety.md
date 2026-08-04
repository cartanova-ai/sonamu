# TypeScript Type Safety in Tests

## TypeScript Type Safety

### Optional Chaining Required When Indexing Arrays

When accessing a property after indexing into an array, you must use optional chaining (`?.`).

Reason:

- Array indexing (`array[0]`, `array[1]`, etc.) can always return `undefined`
- TypeScript infers the type of `array[0]` as `T | undefined`
- Accessing a property without optional chaining causes a compile error

Wrong:

```typescript
// Type error: Object is possibly 'undefined'
expect(list.rows[0].title).toBe("test");
expect(searchResults.rows[0].name).toContain("keyword");
```

Correct:

```typescript
// Use optional chaining
expect(list.rows[0]?.title).toBe("test");
expect(searchResults.rows[0]?.name).toContain("keyword");

// Or verify existence first, then access
expect(list.rows.length).toBeGreaterThanOrEqual(1);
expect(list.rows[0].title).toBe("test"); // now safe
```

### Recommended Patterns

When accessing array elements in test code:

Pattern 1: Use optional chaining

```typescript
const result = await Model.findMany("A", { num: 10, page: 1 });
expect(result.rows[0]?.field).toBe(expectedValue);
```

Pattern 2: Verify length, then access

```typescript
const result = await Model.findMany("A", { num: 10, page: 1 });
expect(result.rows.length).toBeGreaterThanOrEqual(1);
expect(result.rows[0].field).toBe(expectedValue); // type-safe
```

Pattern 3: Optional chaining required when using find()

```typescript
const list = await Model.findMany("A", { num: 10, page: 1 });
const item = list.rows.find((r) => r.id === targetId);
expect(item?.field).toBe(expectedValue); // find() can return undefined
```

### General Rules

- Property access after array indexing: `array[0]?.property`
- Results of `find()`, `filter()[0]`, etc.: always use `?.`
- Nested object access: `obj.nested?.deep?.property`
- Non-null assertion (`!`) only when certain

## Model Basic Methods (Test Targets)

Sonamu Model provides the following methods by default. Tests are written targeting these methods:

| Method                     | Purpose                | Returns                          |
| -------------------------- | ---------------------- | -------------------------------- |
| `findById(subset, id)`     | Fetch single record    | `Promise<Subset>`                |
| `findMany(subset, params)` | Fetch list             | `Promise<ListResult<Subset>>`    |
| `save(rows)`               | Create/update (upsert) | `Promise<number[]>` (ids)        |
| `del(ids)`                 | Delete                 | `Promise<number>` (delete count) |

Note: It's `del`, not `delete`. This avoids JavaScript reserved words.


## Type Safety Notes

### Zod Import Method

Zod is imported as a value in test files, not with `import type`. Tests use Zod schemas and `z.infer<>`
directly, so the object has to exist at runtime — a type-only import compiles and then fails when the
test runs.

```typescript
import { z } from "zod";              // value import
import type { z } from "zod";         // erased at compile time → runtime error
```

Where this applies:

- `*.model.test.ts` - all test files
- `test-helpers.ts` - helper files that use Zod schemas

### Checking partial Settings in SaveParams

When testing `Model.save()`, you must check the `SaveParams` partial settings in `*.types.ts`:

```typescript
// user.types.ts
import { z } from "zod"; // regular import in types files too
import { UserBaseSchema } from "../sonamu.generated";

export const UserSaveParams = UserBaseSchema.partial({
  id: true, // auto-generated
  created_at: true, // auto-generated
  updated_at: true, // auto-generated
});
export type UserSaveParams = z.infer<typeof UserSaveParams>;
```

### Nullable Field Handling Pattern

The `partial` + `extend` + `nullish` pattern is written out in
`references/writing-plan.md` under "Tasks to Do Immediately After Entity Creation".

### Use Nullish Coalescing

Nullish coalescing is required when a variable can be of type `T | undefined`:

```typescript
// WRONG: userId may be number | undefined
const user = await UserModel.findById("A", userId);

// CORRECT: guard against undefined with nullish coalescing
const user = await UserModel.findById("A", userId ?? 0);
```

Especially be careful when using IDs created in a previous step:

```typescript
const [userId] = await UserModel.save([{ ... }]);

// WRONG: userId is number | undefined
const user = await UserModel.findById("A", userId);

// CORRECT:
const user = await UserModel.findById("A", userId ?? 0);
```

### SaveParams Import Location

SaveParams types are exported from each entity's types.ts, not from sonamu.generated.

Wrong:

```typescript
// test-helpers.ts
import type { UserSaveParams, TaskSaveParams } from "../application/sonamu.generated"; // WRONG
```

Correct:

```typescript
// test-helpers.ts
import type { UserSaveParams } from "../application/user/user.types";
import type { TaskSaveParams } from "../application/task/task.types";
```

Reason:

- sonamu.generated only exports BaseSchema and BaseListParams
- SaveParams is defined with BaseSchema.partial() in each entity's types.ts
