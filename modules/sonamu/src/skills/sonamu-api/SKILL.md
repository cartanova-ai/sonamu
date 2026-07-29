---
name: sonamu-api
description: Exposes Model methods as HTTP endpoints with the @api decorator. Use when adding or changing an API endpoint, choosing httpMethod/guards/clients options, or implementing a file upload. Covers @api, @upload, response subset selection, and the generated service client.
---

# @api Decorator

## Basic Usage

```typescript
@api({ httpMethod: "GET" })
async findById(id: number): Promise<User> { }
// → GET /user/findById?id=1
```

## Options

| Option         | Description                                             | Default             |
| -------------- | ------------------------------------------------------- | ------------------- |
| `httpMethod`   | GET, POST, PUT, DELETE, PATCH                           | GET                 |
| `clients`      | Client types to generate                                | `["axios"]`         |
| `resourceName` | queryKey for TanStack Query                             | -                   |
| `guards`       | Authentication/authorization guards                     | -                   |
| `path`         | Custom path                                             | `/{model}/{method}` |
| `description`  | API description (for documentation)                     | -                   |
| `timeout`      | Request timeout (ms)                                    | -                   |
| `contentType`  | Response Content-Type                                   | `application/json`  |
| `cacheControl` | Cache-Control header setting                            | -                   |
| `compress`     | Response compression setting (can disable with `false`) | -                   |

## clients Options

| Client                        | Purpose                  |
| ----------------------------- | ------------------------ |
| `axios`                       | General API calls        |
| `axios-multipart`             | File upload (axios)      |
| `tanstack-query`              | Query hook for reads     |
| `tanstack-mutation`           | Mutation hook for writes |
| `tanstack-mutation-multipart` | File upload Mutation     |
| `window-fetch`                | Browser fetch API        |

## Pattern Examples

### Read API

```typescript
@api({
  httpMethod: "GET",
  clients: ["axios", "tanstack-query"],
  resourceName: "Users",
})
async findMany(params: UserListParams): Promise<ListResult<User>> { }
```

### Write API

```typescript
@api({
  httpMethod: "POST",
  clients: ["axios", "tanstack-mutation"],
})
async save(params: UserSaveParams[]): Promise<number[]> { }
```

### API Requiring Authorization

```typescript
@api({ httpMethod: "POST", guards: ["admin"] })
async del(ids: number[]): Promise<number> { }
```

## Context Access

```typescript
import { Sonamu } from "sonamu";

@api({ httpMethod: "GET", guards: ["user"] })
async me(): Promise<User | null> {
  const { user } = Sonamu.getContext();
  return user ? this.findById("A", user.id) : null;
}
```

| Context Property | Description                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `user`           | Authenticated user (better-auth User, null if unauthenticated)      |
| `session`        | Current session info (better-auth Session, null if unauthenticated) |
| `request`        | FastifyRequest                                                      |
| `reply`          | FastifyReply                                                        |
| `headers`        | HTTP request headers                                                |
| `bufferedFiles`  | Buffer mode uploaded files                                          |
| `uploadedFiles`  | Stream mode uploaded files                                          |
| `locale`         | Request locale                                                      |

## File Upload (@upload)

> **CRITICAL: `@upload` is used standalone without `@api`.**
> Adding `@upload` **automatically generates** a POST endpoint and `axios-multipart`/`tanstack-mutation-multipart` clients.
> Adding `@api` alongside it causes a **build error** due to `checkSingleDecorator` conflict.

```typescript
// CORRECT
@upload({ limits: { files: 10 }, guards: ["user"] })
async upload(...): Promise<number[]> { }

// WRONG — causes build error
@api({ httpMethod: "POST", clients: ["axios-multipart"] })
@upload({ limits: { files: 10 } })
async upload(...): Promise<number[]> { }
```

**`@upload` supported options** (`httpMethod`, `clients` are not supported — set automatically)

| Option         | Description                                         |
| -------------- | --------------------------------------------------- |
| `guards`       | Authentication/authorization guards                 |
| `limits`       | File count/size limits (`{ files: N }`)             |
| `consume`      | `"buffer"` (default) or `"stream"`                  |
| `description`  | API documentation description                       |
| `destination`  | Stream mode only: storage driver key                |
| `keyGenerator` | Stream mode only: function to generate storage path |

### Parameter Rule: Must Wrap in a Single Object

> **CRITICAL: If an `@upload` method has 2 or more parameters, they must be wrapped into a single object.**
>
> Using multiple primitive parameters causes a codegen bug in `services.template.ts` that generates `useUploadMutation` incorrectly.

```typescript
// WRONG — codegen breaks (missing mutationFn argument)
async upload(entity_type: string, entity_id: number, file_type: string)

// CORRECT — wrap in a single object
async upload(params: { entity_type: string; entity_id: number; file_type: string })
```

Call site pattern:

```typescript
uploadMutation.mutate({
  params: { entity_type, entity_id, file_type },
  files,
});
```

> Root cause: a `split(":")` bug in `services.template.ts` makes `useUploadMutation` drop
> every primitive parameter after the first, so multiple primitives must be wrapped in one object.

### Buffer Mode (Default)

```typescript
@upload({ limits: { files: 10 } })
async uploadFiles(): Promise<{ files: SonamuFile[] }> {
  const { bufferedFiles } = Sonamu.getContext();
  // Access file data via bufferedFiles[].buffer
}
```

### Stream Mode (Large Files)

```typescript
@upload({
  consume: "stream",
  destination: "s3",  // or "fs"
  keyGenerator: (file) => `uploads/${Date.now()}-${file.filename}`,
  limits: { files: 5 },
})
async uploadLargeFiles(): Promise<{ urls: string[] }> {
  const { uploadedFiles } = Sonamu.getContext();
  // Access stored path via uploadedFiles[].key
}
```

---

## Real-world Business Logic Patterns

### Transaction with History Logging

Pattern for atomically handling main data and history together when changing state:

```typescript
// consultation.model.ts

@api({ httpMethod: "POST", guards: ["user"] })
async changeStatus(
  id: number,
  status: ConsultationStatus,
  memo?: string
): Promise<Consultation> {
  const wdb = this.getPuri("w");

  return wdb.transaction(async (trx) => {
    // 1. Update consultation
    await trx.ubRegister("consultations", {
      id,
      status,
      updated_at: new Date()
    });
    await trx.ubUpsert("consultations");

    // 2. Record status change history
    await trx.ubRegister("consultation_histories", {
      consultation_id: id,
      status,
      memo,
      created_at: new Date(),
    });
    await trx.ubUpsert("consultation_histories");

    // 3. Return result
    return this.findById("A", id);
  });
}
```

**Key points:**

- Atomicity guaranteed by transaction
- ubRegister + ubUpsert pattern
- Return latest data after change

### Validation Logic and Business Rules

Pattern for complex validation such as duplicate checks and capacity checks before registration:

```typescript
@api({ httpMethod: "POST", guards: ["user"] })
async enroll(
  courseId: number,
  userId: number
): Promise<Enrollment> {
  // 1. Prevent duplicate registration
  const existing = await this.findOne("A", {
    course_id: courseId,
    user_id: userId,
  });

  if (existing) {
    throw new Error("Already enrolled in this course");
  }

  // 2. Check capacity
  const course = await CourseModel.findById("A", courseId);
  const { total } = await this.findMany({ course_id: courseId });

  if (total >= course.max_students) {
    throw new Error("Course is at capacity");
  }

  // 3. Enroll
  const [id] = await this.save([{ course_id: courseId, user_id: userId }]);
  return this.findById("A", id);
}
```

**Key points:**

- Step-by-step validation (duplicate → capacity)
- Clear error messages
- Save after validation passes

### Using Authorization Guards

Access control based on user role:

```typescript
// Regular user only
@api({ httpMethod: "POST", guards: ["user"] })
async save(spa: PostSaveParams[]): Promise<number[]> { }

// Admin only
@api({ httpMethod: "POST", guards: ["admin"] })
async del(ids: number[]): Promise<number> { }

// Using currently logged-in user info
@api({ httpMethod: "GET", guards: ["user"] })
async myConsultations(): Promise<ListResult<Consultation>> {
  const { user } = Sonamu.getContext();
  return this.findMany({ user_id: user!.id });
}
```

### Writing API Tests

Validating custom APIs in Business Logic tests:

```typescript
// consultation.test.ts
describe("E. Business Logic", () => {
  test("Status change API", async () => {
    const { consultationId } = await createTestConsultationWithDeps();

    // Call custom API
    const updated = await ConsultationModel.changeStatus(
      consultationId,
      "completed",
      "Consultation complete",
    );

    expect(updated.status).toBe("completed");

    // Verify history was recorded
    const histories = await ConsultationHistoryModel.findMany({
      consultation_id: consultationId,
    });
    expect(histories.rows).toHaveLength(1);
  });

  test("Enrollment validation", async () => {
    const courseId = 1;
    const userId = 1;

    // First enrollment succeeds
    await EnrollmentModel.enroll(courseId, userId);

    // Duplicate enrollment fails
    await expect(EnrollmentModel.enroll(courseId, userId)).rejects.toThrow(
      "Already enrolled in this course",
    );
  });
});
```

---

## Conventions and Best Practices

### Error Message Pattern

Use `this.modelName` and the `SD()` function for consistent error messages.

**BAD: Hardcoded model name**

```typescript
// findById
if (!rows[0]) {
  throw new NotFoundException(SD("error.entityNotFound")("Department", id));
}

// findMany
throw new BadRequestException(SD("error.unknownSearchField")(params.search));
```

**GOOD: Using this.modelName**

```typescript
// findById - auto-detects model name
if (!rows[0]) {
  throw new NotFoundException(SD("notFound")(this.modelName, id));
}

// findMany - short and clear key
throw new BadRequestException(SD("search.invalidField")(params.search));
```

**Benefits:**

- DRY principle: model name managed in one place
- Refactoring safe: error messages auto-reflect model name changes
- Short i18n keys: `notFound`, `search.invalidField` are more concise

### satisfies Keyword

Use TypeScript's satisfies keyword to preserve type inference while checking types.

**BAD: Loss of type inference**

```typescript
const params: RoleListParams = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "id-desc" as const,
  ...rawParams,
};
```

**GOOD: Type check + preserved inference with satisfies**

```typescript
const params = {
  num: 24,
  page: 1,
  search: "id" as const,
  orderBy: "id-desc" as const,
  ...rawParams,
} satisfies RoleListParams;
```

**Benefits:**

- Compile-time verification: checks that params satisfies the RoleListParams type
- Preserved type inference: params keeps its narrowed type
- Better IDE support: more accurate autocomplete and type checking

### debug Option

The debug option in executeSubsetQuery defaults to false, so it does not need to be specified explicitly.

**BAD: Unnecessary debug: false**

```typescript
return this.executeSubsetQuery({
  subset,
  qb,
  params,
  enhancers,
  debug: false, // unnecessary — it's the default
});
```

**GOOD: Use the default**

```typescript
return this.executeSubsetQuery({
  subset,
  qb,
  params,
  enhancers,
});
```

**When to use debug: true:**

```typescript
// Only specify when debugging
return this.executeSubsetQuery({
  subset,
  qb,
  params,
  debug: true, // Print SQL query log
});
```

## @stream Decorator (SSE)

Creates a Server-Sent Events endpoint.

```typescript
import { stream } from "sonamu";
import { z } from "zod";

@stream({
  type: "sse",
  events: z.object({
    progress: z.object({ percent: z.number() }),
    done: z.object({ result: z.string() }),
  }),
  guards: ["user"],
})
async processStream() { ... }
```

| Option         | Description                                    | Required |
| -------------- | ---------------------------------------------- | -------- |
| `type`         | `"sse"` (only SSE currently supported)         | Yes      |
| `events`       | Define event keys and payloads with Zod schema | Yes      |
| `path`         | Custom path                                    | -        |
| `resourceName` | Resource name                                  | -        |
| `guards`       | Authentication/authorization guards            | -        |

## @transactional Decorator

Wraps the entire method in an automatic transaction. Reuses an existing transaction context if one is already active.

```typescript
import { transactional } from "sonamu";

@transactional({ isolation: "serializable" })
async transferFunds(fromId: number, toId: number, amount: number) {
  // this.getPuri("w") automatically runs inside the transaction
}
```

| Option      | Description                                                                                | Default |
| ----------- | ------------------------------------------------------------------------------------------ | ------- |
| `isolation` | Transaction isolation level (read uncommitted/read committed/repeatable read/serializable) | -       |
| `readOnly`  | Read-only transaction                                                                      | `false` |
| `dbPreset`  | DB preset                                                                                  | `"w"`   |
