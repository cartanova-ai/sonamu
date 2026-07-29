# Test Writing Plan and Rollout Strategy

## Test Writing Plan

### Planning Based on Entity Design Prompt

After entity design is complete (confirming migration + scaffolding succeed), group tests according to **the business processes and data flows specified at the time of entity design**.

**CRITICAL:** Group tests by **business flow units**, not by simple alphabetical order or individual entities.

### Step 1: Re-examine the Entity Design Prompt

Extract the following from the prompt written at the time of the design request:

- Business process flow
- Relationships between entities (relations)
- Data creation order
- Key usage scenarios

### Step 2: Group by Business Process

Group entities by **business flow units**, not simple priority.

**Customer consultation system example:**

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

**For each group:**

1. **Modify types.ts** - handle nullable fields for all entities in the group at once
2. **Extend test-helpers.ts** - write helper functions for entities in the group together
3. **Write test files** - write in dependency order within the group
4. **Business Logic tests** - implement real business scenarios (the key!)
5. **Verify tests pass** - proceed to next group

**test-helpers.ts example (considering dependency chains):**

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

### Step 4: Business Logic Tests (the key!)

**IMPORTANT:** The E. Business Logic section is the most important.

In this section:

- Implement **real business scenarios** specified in the entity design prompt
- Test **interactions** between entities
- Validate **data flows**

This is what differentiates it from simple CRUD tests, and it's **the core that validates design intent**.

**Business Logic test example (consultation process):**

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

### Notes

**DO:**

- Always reference the entity design prompt
- Group by business process flow
- Test order that considers dependency order
- Business Logic tests based on real usage scenarios
- Clearly implement dependency chains in test-helpers

**DON'T:**

- Write tests in simple alphabetical order
- Only test entities individually (missing integration perspective)
- Set priorities unrelated to business flow
- Write tests that ignore the intent of the entity design

### Checklist per Group

When test writing for a process group is complete:

- [ ] Nullable field handling in types.ts completed for all entities in the group
- [ ] test-helpers written reflecting dependency chains within the group
- [ ] Module test file written for each entity in the group
- [ ] **Key business scenarios included in Business Logic tests**
- [ ] All tests pass confirmed (`pnpm sonamu test`)
- [ ] Proceed to next group

## Tasks to Do Immediately After Entity Creation

### Handling nullable Fields in types.ts (Required)

After creating an entity and generating types.ts with `sonamu generate`, immediately handle nullable fields **before writing tests**.

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

**STEP 1: File generated after running sonamu generate**

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

**STEP 2: Immediate fix (nullable fields + Zod import handling)**

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

**Problem:** Zod's `nullable()` gives `T | null` but it's still required.

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

**Solution:** Combination of `partial()` + `extend()` + `nullish()`

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

- [ ] Change `import type { z }` to `import { z }`
- [ ] Add nullable fields to partial
- [ ] Redefine as nullish via extend
- [ ] Use `.optional().default()` for dbDefault fields
- [ ] Confirm required fields are excluded from partial

**Detailed type safety guide:** See "TypeScript Type Safety" and "Type Safety Notes" sections below


## Large-Scale Project Strategy (10 or more entities)

**CRITICAL: Do not work on all entities at once if a project has 10 or more entities.**

### Problems

- Working on 55 entities at once causes context confusion
- Serious risk of errors such as modifying the wrong file or deleting required content
- Cannot track relationships, lose direction while writing tests

### Solution: Batch Work Units

**Rule: Group related entities together and work in batches of 5–10**

```
Batch 1: User, Institution, Role related (5 entities)
  → Tests complete → Commit

Batch 2: Survey, Question, Response related (7 entities)
  → Tests complete → Commit

Batch 3: Report, Statistics related (6 entities)
  → Tests complete → Commit
```

### Batch Grouping Criteria

**Grouping by domain (recommended):**

```
Auth/Permissions: User, Role, Permission, Session
Surveys: Survey, Question, Choice, Response
Reports: Report, Chart, Export
Administration: Institution, Department, Settings
```

**Grouping by dependencies:**

```
1st: Independent entities (User, Institution, etc.)
2nd: Entities depending on 1st (Survey → Institution)
3rd: Entities depending on 2nd (Question → Survey)
```

### Batch Work Process

**For each batch:**

1. List entities in the batch explicitly
2. Write test helpers (createTest...)
3. Complete tests for all entities
4. Confirm all tests pass
5. **Git commit, then proceed to next batch**

**Between-batch checklist:**

- [ ] All tests in current batch pass
- [ ] Previous batch tests still pass (prevent regression)
- [ ] Commit complete (establish rollback point)

### Declare Before Starting Work

**IMPORTANT: Declare explicitly before starting each batch**

```
"Starting batch 1: User, Institution, Role entities (5)
- User: write user.model.test.ts
- Institution: write institution.model.test.ts
- Role: write role.model.test.ts
Only work on files to be modified, do not touch other files
Shall we proceed?"
```

### Warning Signs

**Stop work immediately** if any of the following occur:

- Attempting to modify entities outside the batch scope
- Asking the same question repeatedly
- Confusing entity relationships
- Trying to re-modify files already completed
