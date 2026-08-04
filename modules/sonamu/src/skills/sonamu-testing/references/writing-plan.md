# Test Writing Plan and Rollout Strategy

How much to test is your project's call. This document is for the case where you have already
decided to cover many entities at once — it is about ordering that work so fixtures and FK
constraints cooperate, not about a required amount of coverage.

## Grouping tests across many entities

### Group by data dependency, not alphabetically

Group by the business flows and data-creation order the entities were designed around. Alphabetical
or one-entity-at-a-time order forces you to re-create the same parent rows in every file and hits FK
constraints in whatever order they happen to fall.

### Step 1: Re-examine the Entity Design Prompt

Extract the following from the prompt written at the time of the design request:

- Business process flow
- Relationships between entities (relations)
- Data creation order
- Key usage scenarios

### Step 2: Group by Business Process

Group entities by business flow units, not simple priority.

Customer consultation system example:

```
Group 1: Core Infrastructure
Organization (related agency)
└─ User
   └─ LoginHistory

Business flow: register agency → create user → login
Test order: Organization → User → LoginHistory

Group 2: Damage Type Management
DamageType (self-referencing)
└─ CounterMeasure

Business flow: build damage type hierarchy → write countermeasures for each type
Test order: DamageType → CounterMeasure

Group 3: Consultation Process (core business)
User (applicant) + User (counselor) + DamageType
└─ Consultation
   ├─ ConsultationChannelLog
   └─ ConsultationHistory

Business flow:
1. Applicant submits consultation request
2. Assign counselor
3. Classify damage type
4. Communication by channel (online/phone/SMS/KakaoTalk)
5. Record status change history

Test order: Consultation → ConsultationChannelLog → ConsultationHistory

Group 4: Content Management (independent)
FAQ
Banner
Material
Notice

Business flow: independent CRUD for each
Test order: any order (can be written in parallel)
```

### Step 3: Work Order per Group

For each group:

1. Modify types.ts - handle nullable fields for all entities in the group at once
2. Extend test-helpers.ts - write helper functions for entities in the group together
3. Write test files - write in dependency order within the group
4. Business Logic tests - the scenarios that span the group's entities
5. Verify tests pass - proceed to next group

test-helpers.ts example (considering dependency chains):

```typescript
// Write helpers considering dependency chains
export async function createTestUserWithDeps() {
  const organizationId = await createTestOrganization();
  const userId = await createTestUser(organizationId);
  return { organizationId, userId };
}

export async function createTestConsultationWithDeps() {
  const { userId: applicantId } = await createTestUserWithDeps({
    role: "applicant",
  });
  const { userId: counselorId } = await createTestUserWithDeps({
    role: "counselor",
  });
  const damageTypeId = await createTestDamageType(null);
  const consultationId = await createTestConsultation(applicantId, counselorId, damageTypeId);
  return { applicantId, counselorId, damageTypeId, consultationId };
}
```

### Step 4: Business Logic Tests

The `E. Business Logic` section is where a multi-entity scenario runs end to end — interactions
between entities and the data flow between them, rather than one entity's CRUD surface. This is the
part that fails when the design itself is wrong, which per-entity tests pass right over.

Business Logic test example (consultation process):

```typescript
describe("E. Business Logic", () => {
  test("full process from consultation submission to completion", async () => {
    // 1. submit consultation + create dependencies
    const { consultationId, counselorId } = await createTestConsultationWithDeps();
    // 2. record channel logs (online submission, phone consultation)
    await createTestConsultationChannelLog(consultationId, {
      channel: "online",
    });
    await createTestConsultationChannelLog(consultationId, {
      channel: "phone",
    });
    // 3. record status history
    await createTestConsultationHistory(consultationId, counselorId, {
      status: "consulting",
    });
    // 4. complete consultation
    await ConsultationModel.save([{ id: consultationId, status: "completed" }]);
    // 5. verify: status, 2 channel logs, history
    const c = await ConsultationModel.findById("A", consultationId);
    expect(c.status).toBe("completed");
  });
});
```

### What the grouping buys you

- Dependency order lets `test-helpers` build each chain once instead of every file re-creating the
  same parent rows
- A scenario spanning several entities catches what per-entity CRUD tests cannot: wrong save order, a
  relation that silently fails to persist, a status transition that skips a step
- Alphabetical or strictly one-entity-at-a-time order tends to hit FK constraints in arbitrary order

### Per group

- Nullable fields handled in `types.ts` for the entities in the group
- test-helpers reflect the dependency chains within the group
- Tests pass (`pnpm sonamu test`)

## Tasks to Do Immediately After Entity Creation

### Handling nullable Fields in types.ts (Required)

After creating an entity and generating types.ts with `sonamu generate`, immediately handle nullable fields before writing tests.

#### Work Order

1. Run `sonamu generate`
2. Check the generated `*.types.ts` file
3. Apply partial + extend + nullish handling for nullable fields
4. Start writing tests

#### Fields to Process

- All fields with `nullable: true`
- Fields with `dbDefault` (`.optional().default(value)`)
- FK relation fields that are nullable

#### Practical Example

STEP 1: File generated after running sonamu generate

```typescript
// faq.types.ts (auto-generated)
import type { z } from "zod"; // WRONG: type import
import { FAQBaseListParams, FAQBaseSchema } from "../sonamu.generated";

export const FAQListParams = FAQBaseListParams;
export type FAQListParams = z.infer<typeof FAQListParams>;

export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true,
});
export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

STEP 2: Immediate fix (nullable fields + Zod import handling)

```typescript
// faq.types.ts (fix complete)
import { z } from "zod"; // CORRECT: change to regular import
import { FAQBaseListParams, FAQBaseSchema } from "../sonamu.generated";

export const FAQListParams = FAQBaseListParams;
export type FAQListParams = z.infer<typeof FAQListParams>;

export const FAQSaveParams = FAQBaseSchema.partial({
  id: true,
  created_at: true,
  updated_at: true,
  // add nullable fields
  category: true,
  order_num: true,
}).extend({
  // redefine nullable fields as nullish
  category: z.string().nullish(), // string | null | undefined
  order_num: z.number().nullish(), // number | null | undefined
  updated_at: z.date().nullish(), // date | null | undefined
});

export type FAQSaveParams = z.infer<typeof FAQSaveParams>;
```

#### Why Is This Necessary?

Problem: Zod's `nullable()` gives `T | null` but it's still required.

```typescript
// entity.json
{ "name": "category", "type": "string", "nullable": true }

// Generated BaseSchema
z.object({
  category: z.string().nullable(),  // string | null (required!)
})

// applying partial only
.partial({ category: true })  // category?: string | null

// WRONG: undefined cannot be assigned to string | null
const [id] = await FAQModel.save([{
  question: "Question",
  answer: "Answer",
  // omitting category causes type error!
}]);
```

Solution: Combination of `partial()` + `extend()` + `nullish()`

```typescript
// CORRECT: proper handling
FAQBaseSchema.partial({ category: true }).extend({
  category: z.string().nullish(),
}); // string | null | undefined

// Can freely omit in tests
const [id] = await FAQModel.save([
  {
    question: "Question",
    answer: "Answer",
    // category can be omitted!
  },
]);
```

#### Application Criteria

| Field type                       | Handling                        |
| -------------------------------- | ------------------------------- |
| `id`, `created_at`, `updated_at` | Always partial (auto-generated) |
| Fields with `dbDefault`          | `.optional().default(value)`    |
| Fields with `nullable: true`     | partial + extend + `.nullish()` |
| Required fields                  | Excluded from partial           |

#### Checklist

- Change `import type { z }` to `import { z }`
- Add nullable fields to partial
- Redefine as nullish via extend
- Use `.optional().default()` for dbDefault fields
- Confirm required fields are excluded from partial

Detailed type safety guide: `references/type-safety.md`


## Working through many entities in batches

Covering dozens of entities in one pass tends to go wrong in a specific way: relationships stop
being trackable, and edits land in the wrong file. Batches of 5–10 related entities keep each pass
reviewable. This is a way to organise a large pass you have already decided to make.

### Batch units

Group related entities together, 5–10 per batch

```
Batch 1: User, Institution, Role related (5 entities)
  → Tests complete → Commit

Batch 2: Survey, Question, Response related (7 entities)
  → Tests complete → Commit

Batch 3: Report, Statistics related (6 entities)
  → Tests complete → Commit
```

### Batch Grouping Criteria

Grouping by domain (recommended):

```
Auth/Permissions: User, Role, Permission, Session
Surveys: Survey, Question, Choice, Response
Reports: Report, Chart, Export
Administration: Institution, Department, Settings
```

Grouping by dependencies:

```
1st: Independent entities (User, Institution, etc.)
2nd: Entities depending on 1st (Survey → Institution)
3rd: Entities depending on 2nd (Question → Survey)
```

### Per batch

1. Name the entities in the batch, and write test helpers (`createTest...`) shared by them
2. Write the tests
3. Run the current batch, then the earlier ones — shared helpers and fixtures are the usual source
   of regressions across batch boundaries

### Signs the batch is too large

- Edits reaching entities outside the batch
- Relationships getting confused, or the same question resurfacing
- Re-editing files already finished in this pass
