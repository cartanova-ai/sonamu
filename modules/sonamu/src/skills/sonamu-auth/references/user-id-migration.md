# User.id Type Migration for External Auth

# Auth System Migration (Integrating External Auth such as better-auth)

## Situation

When User.id type change is needed to integrate an external authentication system (better-auth, NextAuth, etc.) with an existing Sonamu project

## Problem

- better-auth requires User.id to be of type string (text)
- The existing system uses integer type
- All FKs referencing User must be changed together
- FK constraint violations occur if migration order is wrong

## Solution

### 1. Change Entity Type

```json
// user.entity.json
{
  "props": [{ "name": "id", "type": "string", "desc": "ID" }]
}
```

Note: changing from integer to string

### 2. Identify Affected FKs

```bash
# Find all relations referencing User
grep -r "with.*User" --include="*.entity.json"
```

Tables commonly affected:

- accounts.user_id
- sessions.user_id
- evaluation_committees.evaluator_id (or other User-referencing FKs)
- project_participants.user_id
- reports.submitted_by_id

### 3. Migration Write Order (Required)

Wrong order - FK constraint violation:

```typescript
// wrong example
await knex.schema.alterTable("accounts", (table) => {
  table.text("user_id").alter(); // fails: FK still references users.id(integer)
});
```

Correct order:

```typescript
export async function up(knex: Knex): Promise<void> {
  // Step 1: Remove all FK constraints
  await knex.raw('ALTER TABLE "accounts" DROP CONSTRAINT "accounts_user_id_foreign"');
  await knex.raw('ALTER TABLE "sessions" DROP CONSTRAINT "sessions_user_id_foreign"');
  await knex.raw(
    'ALTER TABLE "evaluation_committees" DROP CONSTRAINT "evaluation_committees_evaluator_id_foreign"',
  );
  await knex.raw(
    'ALTER TABLE "project_participants" DROP CONSTRAINT "project_participants_user_id_foreign"',
  );
  await knex.raw('ALTER TABLE "reports" DROP CONSTRAINT "reports_submitted_by_id_foreign"');

  // Step 2: Remove PK constraint
  await knex.raw('ALTER TABLE "users" DROP CONSTRAINT "users_pkey"');

  // Step 3: Change all column types (parent PK + child FKs)
  await knex.raw('ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text');
  await knex.raw('ALTER TABLE "accounts" ALTER COLUMN "user_id" TYPE text USING "user_id"::text');
  await knex.raw('ALTER TABLE "sessions" ALTER COLUMN "user_id" TYPE text USING "user_id"::text');
  await knex.raw(
    'ALTER TABLE "evaluation_committees" ALTER COLUMN "evaluator_id" TYPE text USING "evaluator_id"::text',
  );
  await knex.raw(
    'ALTER TABLE "project_participants" ALTER COLUMN "user_id" TYPE text USING "user_id"::text',
  );
  await knex.raw(
    'ALTER TABLE "reports" ALTER COLUMN "submitted_by_id" TYPE text USING "submitted_by_id"::text',
  );

  // Step 4: Restore PK constraint
  await knex.raw('ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id")');

  // Step 5: Restore FK constraints
  await knex.raw(
    'ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE',
  );
  await knex.raw(
    'ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE CASCADE',
  );
  await knex.raw(
    'ALTER TABLE "evaluation_committees" ADD CONSTRAINT "evaluation_committees_evaluator_id_foreign" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
  await knex.raw(
    'ALTER TABLE "project_participants" ADD CONSTRAINT "project_participants_user_id_foreign" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
  await knex.raw(
    'ALTER TABLE "reports" ADD CONSTRAINT "reports_submitted_by_id_foreign" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON UPDATE RESTRICT ON DELETE RESTRICT',
  );
}
```

Core principles:

1. Column type cannot be changed while FK constraints exist
2. Remove all FKs, then change types, then restore FKs
3. Handle all changes in a single migration

### 4. Notes When Regenerating Migrations

Running `pnpm generate` after entity changes creates duplicate migrations:

```
20260203154926_alter_accounts_alter5.ts           (changes accounts.user_id only)
20260203154927_alter_evaluation_committees.ts    (changes evaluator_id only)
20260203154928_alter_project_participants.ts     (changes user_id only)
20260203154929_alter_reports.ts                  (changes submitted_by_id only)
20260203154930_alter_sessions.ts                 (changes user_id only)
20260203154931_alter_users_pk_type.ts           (consolidated: changes all types)
```

Problems:

- Individual migrations (154926-154930) attempt to change only FK types
- The consolidated migration (154931) changes the same columns
- Running in order causes 154926 to execute first and violate FK constraints

Fix 1: Delete individual migrations

```bash
rm 20260203154926_alter_accounts_alter5.ts
rm 20260203154927_alter_evaluation_committees.ts
rm 20260203154928_alter_project_participants.ts
rm 20260203154929_alter_reports.ts
rm 20260203154930_alter_sessions.ts
# Keep only 20260203154931_alter_users_pk_type.ts
```

Fix 2: Remove user_id-related changes from individual migrations

- Leave only updated_at changes in accounts, sessions migrations and remove user_id changes
- Delete evaluation_committees, project_participants, reports migrations
- Perform type changes in the consolidated migration only

### 5. SaveParams Type Definitions

Auth-related entities have many nullable fields, so all must be treated as optional in SaveParams:

```typescript
// account.types.ts
export const AccountSaveParams = AccountBaseSchema.partial({
  id: true, // to distinguish create vs update
  created_at: true, // auto-generated via dbDefault
  updated_at: true, // auto-generated via dbDefault
  access_token: true, // nullable - OAuth only
  refresh_token: true, // nullable - OAuth only
  id_token: true, // nullable - OAuth only
  access_token_expires_at: true, // nullable
  refresh_token_expires_at: true, // nullable
  scope: true, // nullable - OAuth only
  password: true, // nullable - credential only
});
```

Principles:

- id: optional (generated on create, required on update)
- created_at, updated_at: optional (auto-generated via dbDefault)
- All fields with nullable: true in entity: optional

Not doing this causes type errors when writing tests:

```typescript
// If password is not optional in SaveParams
await AccountModel.save([
  {
    provider_id: "google",
    // type error if password field is not provided
  },
]);
```

### 6. Test Writing Patterns

Bad example - providing unnecessary fields for OAuth account:

```typescript
await AccountModel.save([
  {
    id: `acc_${Date.now()}`,
    account_id: "google_123",
    provider_id: "google",
    user_id: userId,
    access_token: "token_123",
    refresh_token: "refresh_123",
    id_token: "id_token_123",
    password: "hashed_password", // unnecessary for OAuth
    scope: "openid profile email",
    access_token_expires_at: new Date(),
    refresh_token_expires_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  },
]);
```

Good example - provide only required and meaningful fields:

```typescript
// OAuth account
await AccountModel.save([
  {
    id: `acc_${Date.now()}`,
    account_id: "google_123",
    provider_id: "google",
    user_id: userId,
    access_token: "token_123",
  },
]);

// Credential account
await AccountModel.save([
  {
    id: `acc_${Date.now()}`,
    account_id: "email_account",
    provider_id: "credential",
    user_id: userId,
    password: "hashed_password",
  },
]);
```

Principles:

- Provide only fields appropriate to each provider type
- Provide nullable fields only when needed for the test
- Do not provide dbDefault fields (created_at, updated_at)

### 7. Updating test-helpers Types

When User.id changes to string, all helper function types must be updated too:

Wrong types:

```typescript
export async function createTestUser(): Promise<Number> { ... }
export async function createTestProjectParticipant(
  projectId: number,
  userId: number,  // wrong
): Promise<number> { ... }
```

Correct types:

```typescript
export async function createTestUser(): Promise<string> { ... }
export async function createTestProjectParticipant(
  projectId: number,
  userId: string,  // fixed
): Promise<number> { ... }
```

How to check:

```bash
# Find user-related parameters in test-helpers
grep -n "userId.*number" src/testing/test-helpers.ts
grep -n "evaluatorId.*number" src/testing/test-helpers.ts
grep -n "submittedById.*number" src/testing/test-helpers.ts
```

### 8. Handling joinColumn in HasMany Relationships

When configuring a HasMany relationship, the column specified in joinColumn must exist in the child entity:

Wrong configuration:

```json
// project.entity.json
{
  "props": [
    { "name": "files", "type": "relation", "with": "File",
      "relationType": "HasMany", "joinColumn": "entity_id" }
  ]
}

// file.entity.json - no entity_id column
{
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "url", "type": "string" }
  ]
}
```

Error:

```
column files.entity_id does not exist
```

Correct configuration:

```json
// file.entity.json - add entity_id column
{
  "props": [
    { "name": "id", "type": "integer" },
    { "name": "entity_id", "type": "integer", "desc": "entity ID" },
    { "name": "url", "type": "string" }
  ]
}
```

Notes:

- joinColumn is the actual column name in the child table
- That column must exist in the child entity
- Must also be included in subsets to be queryable

### 9. Integrating better-auth Plugins

#### PluginSchema Type Mapping

better-auth plugins define schemas with the PluginSchema type. camelCase field names are automatically mapped to snake_case DB column names:

```typescript
// better-auth plugin schema example
const schema = {
  user: {
    fields: {
      phoneNumber: {
        // camelCase
        type: "string",
        required: false,
      },
    },
  },
};

// stored as phone_number in DB (snake_case)
```

In Sonamu Entity, use the DB column name (snake_case) as-is:

```json
// user.entity.json
{
  "props": [
    {
      "name": "phone_number",
      "type": "string",
      "nullable": true,
      "desc": "phone number"
    }
  ]
}
```

#### Plugin Categories

| Category       | Plugins                                                     | Impact                                         |
| -------------- | ----------------------------------------------------------- | ---------------------------------------------- |
| Basic auth     | email/password, OAuth, magic link, email OTP, multi-session | User/Session/Account/Verification tables       |
| User extension | username, phone number, admin, anonymous                    | Adds fields to User table                      |
| Security       | two-factor, passkey                                         | New tables needed (TwoFactor, Passkey)         |
| Enterprise     | organization, API key, SSO, JWT                             | New tables needed (Organization, Member, etc.) |

#### Classification by Schema Requirements

Only existing table extension needed (add fields to User/Session): username, phone number, admin, anonymous, multi-session

New tables needed: OAuth(Account), magic link/email OTP(Verification), two-factor(TwoFactor), passkey(Passkey), organization(Organization, Member, Invitation), API key(APIKey), SSO(SAMLProvider, SAMLConnection)

#### Entity Writing Patterns

Extending existing tables — add plugin fields to User entity.json:

```json
// user.entity.json - example additional fields by plugin
// phone-number: phone_number(nullable), phone_number_verified(boolean, dbDefault:"false")
// admin: role(enum, dbDefault:"'user'"), banned(nullable), ban_reason(nullable), ban_expires(nullable)
// username: username(string)
// anonymous: is_anonymous(boolean, dbDefault:"false")
```

Creating new tables — For Account/TwoFactor etc.: generate with `pnpm sonamu stub entity` then add fields matching the plugin schema. Key notes:

- `id` is `string` type (32-character alphanumeric)
- FK (`user_id`) is also `string` type (since User.id is string)
- `nullable` fields must explicitly have `"nullable": true`
- better-auth uses camelCase → Sonamu uses snake_case

#### Migration Patterns

Adding fields to existing tables — add plugin fields with `alterTable`:

```typescript
await knex.schema.alterTable("users", (table) => {
  table.string("phone_number", 255).nullable();
  table.boolean("phone_number_verified").defaultTo(false);
  table.text("role").notNullable().defaultTo("user");
});
```

Creating new tables — create without FK first, then add FK (must be separated!):

```typescript
// Step 1: create table (without FK)
await knex.schema.createTable("two_factors", (table) => {
  table.text("id").primary();
  table.text("user_id").notNullable(); // FK column only, no foreign()
  table.text("secret").notNullable();
});
// Step 2: add FK
await knex.schema.alterTable("two_factors", (table) => {
  table.foreign("user_id").references("users.id");
});
```

#### Sonamu Implementation Examples

Currently implemented plugins in Sonamu:

- phone-number plugin: User.phone_number, User.phone_number_verified
- two-factor plugin: TwoFactor table (id, secret, backup_codes, user_id)

Reference paths:

- Example project: `sonamu/examples/miomock/`
- User Entity: `examples/miomock/api/src/application/user/user.entity.json`
- TwoFactor Entity: `examples/miomock/api/src/application/two_factor/two_factor.entity.json`

#### Plugin Addition Steps

1. Write Entity: define fields in `{entity}.entity.json`
2. Generate Migration: auto-generate from Sonamu UI or write manually
3. Update SaveParams: make all nullable fields partial
4. Write Model: implement business logic
5. Update test-helpers: fix parameters whose types changed, such as userId
6. Write tests: write test cases for each provider/plugin

#### Plugin-Specific Notes

- OAuth: different fields used per provider. access_token/refresh_token/password all optional in SaveParams
- two-factor: backup_codes is a JSON string, secret is generated by a TOTP library
- organization: 3-table FK relationships. Migration order: Organization → Member, Invitation
- passkey: public_key is WebAuthn standard, counter is for replay prevention
- SSO: IdP metadata is automatically loaded from metadata_url
