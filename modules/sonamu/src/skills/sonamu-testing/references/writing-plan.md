# Test Writing Plan and Rollout Strategy

How much to test and how to batch the work are project decisions. This reference only addresses the
Sonamu data constraints that matter once a larger fixture-backed test pass has been chosen.

## Grouping tests across many entities

### Group by data dependency, not alphabetically

Start with the relation graph expressed by the current entity definitions and fixture baseline.
Parents required by non-null foreign keys must exist before children; many-to-many rows need both
sides. Grouping by that creation order reduces duplicated setup and makes a failed FK point at the
missing dependency.

### Step 1: Re-examine the Entity Design Prompt

Use current generated entities and schemas as evidence even when a design prompt exists. Record:

- parent rows required by non-null relations;
- stable baseline rows available through `loadFixtures`;
- rows each test must create inside its rollback transaction;
- unique fields that would collide with the fixture baseline;
- operations that escape the DB transaction, such as files or external services.

### Step 2: Group by Business Process

A flow such as `Organization -> User -> LoginHistory` can share small data-building helpers while
keeping each test's writes inside its own transaction. Independent read-only fixture loaders can be
requested together; `createFixtureLoader` invokes them concurrently.

### Step 3: Work Order per Group

For one dependency group:

1. Verify the generated subsets and project-owned save schemas.
2. Identify the minimum existing fixtures and load them by name.
3. Create new parent/child rows serially inside each test when their IDs depend on prior writes.
4. Assert through the public model/API path.
5. Run the focused test through the same package lifecycle used by the target environment.

The last step matters when `pretest` prepares fixture data. A direct `vitest run` intentionally
bypasses that lifecycle and is not evidence for the same preparation path.

### Step 4: Business Logic Tests

For a multi-entity behavior, keep the causal chain visible in one test or a narrowly named helper.
The framework transaction makes earlier writes immediately visible through ordinary `"r"`/`"w"`
model access and rolls them back after the case.

### What the grouping buys you

- FK failures identify the missing layer instead of an arbitrary alphabetic test file.
- Stable fixture reads are separated from transactional writes.
- Helpers encode only real dependency chains rather than entire entity snapshots.
- External side effects that require their own cleanup remain visible.

### Per group

Record runtime test results separately from typecheck/build/check results. If setup fails during
fixture sync, global worker-DB creation, Sonamu initialization, or transaction acquisition, the test
body has not been exercised.

## Tasks to Do Immediately After Entity Creation

This linkable section covers the conditional SaveParams check after entity creation. It is not a
universal testing prerequisite. The initial entity `types.ts` is written once: its `SaveParams`
starts from the generated `BaseSchema`, omits generated/search-text props, makes `id` partial, and
also makes `created_at` partial when that prop exists.

### Handling nullable Fields in types.ts

A nullable BaseSchema prop accepts `null` but remains a required key. Add that prop to the
entity-owned `SaveParams.partial({...})` only when the application's save contract should also allow
the key to be omitted. If callers must choose a value or explicit `null`, leave it required.

For test work, consume the current `SaveParams` as written. If that production input contract needs
to change, return to `sonamu-entity`'s SaveParams/relations guidance; do not change it solely to make
a guessed test object compile.

#### Work Order

1. Read the entity prop's `nullable`, default, generated, and relation metadata.
2. Read the generated BaseSchema and the entity-owned `SaveParams` in `*.types.ts`.
3. If `SaveParams` already matches the intended caller contract, make no schema edit.
4. If the caller contract is wrong, use `sonamu-entity` to adjust its SaveParams shape, then write
   the test against that reviewed production contract.

#### Fields to Process

There is no universal test-only list. A nullable prop is conditionally partial as described above;
generated/search-text fields, ManyToMany ID arrays, defaults, and relation shapes have separate
SaveParams handling in `sonamu-entity`.

#### Practical Example

Prefer a typed object that proves the current input shape:

```typescript
const input = {
  title: "테스트 문서",
  author_id: author.id,
} satisfies DocumentSaveParams;

const [id] = await DocumentModel.save([input]);
```

#### Why Is This Necessary?

Guessing optionality creates tests for a shape the application does not accept. Conversely, making a
required production field optional solely for a test weakens the application contract.

#### Application Criteria

Use the actual BaseSchema plus entity-owned SaveParams. Only optional caller input belongs in
`partial`; `nullable` by itself does not decide optionality.

#### Checklist

- Current BaseSchema, generated subset, and save declaration were read.
- Relation objects were not spread into FK save inputs.
- Required fixture parents exist.
- Generated IDs are guarded before use.

## Working through many entities in batches

### Batch units

Batch size is project policy. The Sonamu-specific boundary is shared state: serialize work that
mutates fixture databases, migrations, generated artifacts, or common setup files.

### Batch Grouping Criteria

Use relation/fixture dependency and shared setup ownership. Tests that only read independent fixture
rows can be authored separately; fixture sync and generated config cannot safely race in one
workspace.

### Per batch

Run focused runtime tests where the DB/harness is available, then static type/build checks. State
which evidence actually executed test bodies.

### Signs the batch is too large

- helpers create unrelated entity graphs;
- one fixture change affects many otherwise independent files;
- failures no longer reveal whether setup, DB isolation, or assertion logic is responsible;
- validation cannot name which test bodies actually ran.
