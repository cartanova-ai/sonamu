# User.id Migration — Mistakes, Checklist, Fixtures

## Common Mistakes

### Mistake 1: Applying Migrations Individually in Order

```bash
# wrong approach
pnpm migration:apply  # fails because accounts.user_id change runs first
```

Reason: when trying to change accounts.user_id to text, users.id is still integer, so FK constraint violation

Correct approach: handle all changes in a single migration

### Mistake 2: Not Updating test-helpers Types

```typescript
// helper function returns number even though User.id is string
async function createTestUser(): Promise<number> { ... }

// type error on use
const userId = await createTestUser();  // cannot assign string to number
await createTestProjectParticipant(projectId, userId);
```

Fixes needed:

- createTestUser return type: string
- All helper function parameters that receive userId: string

### Mistake 3: Missing HasMany joinColumn

```json
// Parent
{ "name": "files", "relationType": "HasMany", "joinColumn": "entity_id" }

// error if Child does not have entity_id
```

Error message: `column files.entity_id does not exist`

Fix: add the column specified in joinColumn to the Child entity

### Mistake 4: Not Making Nullable Fields Optional in SaveParams

```typescript
// if password is not optional in SaveParams
await AccountModel.save([
  {
    provider_id: "google",
    // type error if password is absent
  },
]);
```

### Mistake 5: Not Cleaning Up Duplicate Migrations

After entity changes, generating creates both individual migrations and a consolidated migration. If the individual migrations are not removed, they run in order and violate FK constraints

### Mistake 6: Using PluginSchema Field Names Directly in Sonamu Entity

Must use snake_case (`phone_number`) in Sonamu Entity, not better-auth's camelCase (`phoneNumber`). better-auth automatically converts camelCase → snake_case.

### Mistake 7: Adding FK at the Same Time as Table Creation for New Tables

Table creation and FK addition must be separated. Using `foreign()` together with table creation may reference a table that does not exist yet — see `sonamu-migration`'s execution-order section.

## Checklist

Entity updates:

- Change User.id type to string
- Check all FK entities referencing User (search with grep)
- If there are HasMany relationships, confirm the joinColumn column exists in the child entity
- Check required fields per better-auth plugin (extend existing table vs. new table)

Writing Migration:

- Write consolidated migration (FK removal → type change → FK restore order)
- Delete individually generated duplicate migration files
- Write down function in correct order too
- Check FK order when creating new tables (create table → add FK)

Type definitions:

- Make all nullable fields partial in SaveParams
- Make dbDefault fields (created_at, updated_at) partial in SaveParams
- Change userId-related parameters in test-helpers to string
- Fix return types in test-helpers (Promise<String> -> Promise<string>)

Test code:

- Remove unnecessary nullable fields from tests
- Separate tests for OAuth accounts and credential accounts
- Provide only fields appropriate to each provider
- Write test cases per plugin (phone-number, two-factor, etc.)

Execution:

- Regenerate stubs: `pnpm stub`
- Generate migration: `pnpm generate`
- Clean up duplicate migrations
- Apply migration: `pnpm migration:apply`
- Run all tests: `pnpm test`

## Generating better-auth Entity Fixtures

### Generation Order (Required)

better-auth entities must have fixtures generated in the following order due to FK dependencies.

```
User → Account → Session → Verification (optional)
```

Account and Session reference User via user_id (string FK), so User must be created first.

### Generation Commands

```bash
# 1. Generate User first
pnpm sonamu fixture gen --include User --count 10 --use-llm

# 2. Generate Account (depends on User)
pnpm sonamu fixture gen --include Account --count 10 --use-llm

# 3. Generate Session (depends on User)
pnpm sonamu fixture gen --include Session --count 10 --use-llm

# Or generate together including User (auto-sorted order)
pnpm sonamu fixture gen --include User,Account,Session --count 10 --use-llm
```

### User.id Sequence Setup Required

The better-auth User entity has id as string type, but fixture gen automatically uses a numeric sequence. If `users_id_seq` was not created during initial project setup, fixture gen will fail.

```sql
-- must be set up in advance
CREATE SEQUENCE users_id_seq;
ALTER TABLE users ALTER COLUMN id SET DEFAULT nextval('users_id_seq')::text;
```

If it has already been set up but is missing, run the above query before proceeding with fixture gen.

### cone.fixtureStrategy Configuration Recommended

Check that `"fixtureStrategy": "sequence"` is set on the id prop in User entity.json:

```json
{
  "name": "id",
  "type": "string",
  "cone": {
    "fixtureStrategy": "sequence",
    "note": "User ID managed by better-auth (string type)"
  }
}
```

### Notes When Generating Account

Account has different structure for credential accounts and OAuth accounts:

```typescript
// credential account (email/password)
{
  provider_id: "credential",
  account_id: "user@example.com",
  user_id: existingUserId,
  password: hashedPassword,
}

// OAuth account (Google, etc.)
{
  provider_id: "google",
  account_id: "google-oauth-id-12345",
  user_id: existingUserId,
  // no password
}
```

Setting `--use-llm` and cone.note appropriately allows the LLM to generate contextually appropriate provider_id and account_id.

## Related Skills

- migration: Migration basics, PK type changes
- entity-basic: Entity type definitions
- entity-relations: BelongsToOne, HasMany relationships
- testing: Test writing patterns
- fixture-cli: Fixture generation CLI usage
