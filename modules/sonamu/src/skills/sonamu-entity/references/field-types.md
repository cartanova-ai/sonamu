# Props — Types, Options, and Generated Output

## Prop types

Every type below is valid in `props`. Anything else fails validation with
`type은 'integer', 'integer[]', ... 중 하나여야 합니다. 입력값: "..."` — notably `"text"` is not a
type; long text is `"string"` with `length` omitted.

| Type | Required | Optional | PostgreSQL | TypeScript |
| --- | --- | --- | --- | --- |
| `integer`, `integer[]` | — | — | `integer` | `number` |
| `bigInteger`, `bigInteger[]` | — | — | `bigint` | `bigint` |
| `string`, `string[]` | — | `length`, `zodFormat` | `varchar(n)`, `text` when `length` omitted | `string` |
| `enum`, `enum[]` | `id` | — | `text` | the enum union |
| `number`, `number[]` | — | `precision`, `scale`, `numberType` | `numeric(p,s)`, or `real` / `double precision` | `number` |
| `numeric`, `numeric[]` | — | `precision`, `scale` | `numeric(p,s)` | `string` |
| `boolean`, `boolean[]` | — | — | `boolean` | `boolean` |
| `date`, `date[]` | — | `precision` (0–6, default 3) | `timestamptz` | `Date` |
| `uuid`, `uuid[]` | — | — | `uuid` | `string` |
| `json` | `id` | — | `jsonb` | the type named by `id` |
| `searchText` | `sourceColumns` | — | `text`, generated | `string` |
| `vector` | `dimensions` | — | `vector(n)` | `number[]` |
| `vector[]` | `dimensions` | — | `vector(n)[]` | `number[][]` |
| `tsvector` | — | — | `tsvector` | `string` |
| `virtual` | `id` | `virtualType` (`query` \| `code`, default `code`) | none | the type named by `id` |
| `relation` | `with`, `relationType` | varies — see `references/relations.md` | FK column or none | the related subset |

Two rows read as "a number" but are not:

- `numeric` is generated as `z.string()`, so it arrives in TypeScript as a **`string`**. `number` with
  `numberType: "numeric"` produces the same PostgreSQL column but is generated as `z.number()`.
- `bigInteger` is generated as `z.bigint()`, so it does not mix with `number` in arithmetic and
  `JSON.stringify` throws on it.

`integer` and `number` are not interchangeable either: changing one to the other after the table
exists costs an ALTER migration. Give `number` an explicit `precision` and `scale`, or the precision
is left to the driver's default.

`length` on a `string` does double duty: it sets `varchar(n)` and appends `.max(n)` to the generated
Zod schema, so an over-long value is rejected before it reaches the database. With `zodFormat` set,
the format check replaces `z.string()` and `length` still applies on top.

An `enum` prop's `id` must also appear as a key in `enums`, or sync fails on a type that was never
defined.

`enum` and `string` generate the same DDL — a `text` column, with no CHECK constraint — so the
database accepts any value for either. The difference is above the database: the generated schema is
the enum's union rather than `z.string()`, and the scaffolded form renders a select instead of a
free-text input. An `enum` prop also accepts `length`, which reaches neither the column type nor the
generated schema and is silently ignored.

```json
"props": [{ "name": "status", "type": "enum", "id": "ProductStatus", "desc": "상태" }],
"enums": { "ProductStatus": { "draft": "작성중", "published": "게시됨" } }
```

`json` needs `id` too — it names the TypeScript type, which you define yourself.

## Options on every prop

| Option | Type | Effect |
| --- | --- | --- |
| `name` | string | Column name. Required |
| `desc` | string | Description, used as the generated label |
| `nullable` | boolean | Appends `.nullable()` to the generated schema and allows NULL. Default `false` |
| `dbDefault` | string \| number \| boolean | Column DEFAULT — see below |
| `generated` | object | Generated column — see below |
| `toFilter` | true | Registers the prop in `BaseListParams` as a filtering target. See `sonamu-query`'s `references/model.md` |
| `cone` | object | LLM-oriented fixture metadata. See `sonamu-fixture`'s `references/cone.md` |

Each prop type's schema is strict: any key not listed for that type fails validation with
`props.<n>: Unrecognized key: "<key>"`. That covers a whole class of errors — a misspelled `lenght`, a
`length` on a type that has none, an `onDelete` on a HasMany. The message names the index in `props`,
so read it as a pointer to the offending prop rather than to the entity.

Nullable props and props with a `dbDefault` are listed in the BaseSchema type's `__hasDefault__`,
which is what makes them optional to Puri. `SaveParams` does not inherit that — see Step 4 in
`references/creation-workflow.md`.

A prop without `nullable: true` is required on **updates** as well as inserts, because `ubUpsert`
compiles to `ON CONFLICT ... DO UPDATE`: a partial update that omits one fails. Details in
`sonamu-query`'s `references/upsert.md`, "Required fields on every call, including updates".

## dbDefault — one rule

A **string** `dbDefault` that starts with `"` becomes a literal value. Everything else — any other
string, a number, a boolean — is emitted as **raw SQL**.

| Written in entity.json | Emitted | Result |
| --- | --- | --- |
| `"dbDefault": "\"pending\""` | `defaultTo("pending")` | `default 'pending'` |
| `"dbDefault": "CURRENT_TIMESTAMP"` | `defaultTo(knex.raw('CURRENT_TIMESTAMP'))` | `default CURRENT_TIMESTAMP` |
| `"dbDefault": "false"` | `defaultTo(knex.raw('false'))` | `default false` |
| `"dbDefault": 0` | `defaultTo(knex.raw('0'))` | `default 0` |
| `"dbDefault": "{}"` on a `json` prop | `defaultTo(knex.raw("{}::jsonb"))` | `default '{}'::jsonb` |

A text-valued default therefore needs escaped quotes, and that applies to `string` as much as to
`enum`:

```json
{ "name": "status", "type": "enum", "id": "ApprovalStatus", "dbDefault": "\"pending\"" }
{ "name": "locale", "type": "string", "length": 8, "dbDefault": "\"ko\"" }
```

The two ways it goes wrong:

- Unquoted (`"dbDefault": "pending"`) — emitted as raw SQL, so PostgreSQL reads `pending` as a column
  reference and rejects the DEFAULT expression.
- Single-quoted (`"dbDefault": "'pending'"`) — the generated migration file fails oxfmt.

Boolean defaults work as the string `"false"` or the JSON literal `false`, since both reach raw SQL as
valid boolean syntax. `"1"` and `"0"` do not: they reach a boolean column as integer literals and
PostgreSQL rejects the DEFAULT.

## Generated columns

`generated` computes the column from a SQL expression; the database maintains it and INSERT/UPDATE
cannot supply a value.

```json
{
  "name": "total_amount",
  "type": "numeric",
  "precision": 12,
  "scale": 2,
  "generated": { "type": "STORED", "expression": "unit_price * quantity" }
}
```

Three constraints, each a validation error rather than a runtime surprise:

- `dbDefault와 generated는 함께 사용할 수 없습니다` — the two are mutually exclusive.
- `virtual 타입은 generated column을 지원하지 않습니다` — `virtual` props are not columns.
- `VIRTUAL generated column은 <type> 타입을 지원하지 않습니다. STORED를 사용하세요.` — `VIRTUAL`
  rejects `json`, `vector`, `vector[]`, and every array type. `STORED` accepts all of them.

Generated props — and `searchText`, which is one — are listed in the BaseSchema type's `__generated__`,
which is how Puri rejects writes to them. They are **not** removed from `SaveParams`: BaseSchema still
carries the field, so the `.omit()` in `types.ts` is what keeps them out. See "SaveParams shapes" in
`references/relations.md`.

## searchText

Consolidates several columns into one generated text column for pg_trgm fuzzy search. Pair it with a
GIN trigram index — `references/indexes.md`.

```json
{
  "name": "search_text",
  "type": "searchText",
  "sourceColumns": [
    { "name": "title_ko" },
    { "name": "title_en", "caseInsensitive": true },
    { "name": "tags" }
  ]
}
```

Sources must be `string`, `string[]`, or a `json` prop whose type is `z.array(z.string())`; any other
type fails with `searchText source column "<name>"의 타입 "<type>"은(는) 지원되지 않습니다.`, and a
name matching no prop fails with `searchText source column "<name>"을(를) 찾을 수 없습니다.`

| Source type | `caseInsensitive: true` | default |
| --- | --- | --- |
| `string` | `lower(COALESCE(col, ''))` | `COALESCE(col, '')` |
| `string[]` | `sonamu_text_array_agg(col)` | `sonamu_text_array_agg(col, false)` |
| `json` (`z.array(z.string())`) | `sonamu_jsonb_array_agg(col)` | `sonamu_jsonb_array_agg(col, false)` |

With a `string[]` or `json` source, the helper function DDL is inserted into the migration
automatically. Query usage is in `sonamu-query`'s `references/search.md`, "pg_trgm Fuzzy Search".

## OrderBy and SearchField enums

Neither is enforced by the schema, but the scaffolded model reads both: `findMany` sorts by
`{EntityId}OrderBy` and rejects an unlisted search field with
`BadRequestException(SD("error.unknownSearchField"))`.

Scaffolded model code handles `id-desc` and nothing else, so every extra value present at scaffold
time becomes an unhandled branch: scaffolding still succeeds, but the model's `exhaustive()` call
type-errors until the case is added by hand.

```json
"ProductOrderBy": { "id-desc": "최신순" },
"ProductSearchField": { "id": "ID", "name": "이름" }
```

Each addition is two edits — the enum value, and the matching branch in the model:

```typescript
if (params.orderBy === "id-desc") {
  qb.orderBy("products.id", "desc");
} else if (params.orderBy === "name-asc") {
  qb.orderBy("products.name", "asc");
} else {
  exhaustive(params.orderBy);
}
```

## Enums may carry cone metadata

`enums` accepts both the plain `Record<string, string>` form and an object form that adds `cone`;
`subsets` has the same pair. `sonamu stub entity` generates cone metadata by default, so an
entity.json you open may already be in the second form. Both validate, and both mean the same thing
to the generator.

```json
"enums": {
  "ProductOrderBy": { "id-desc": "최신순" },
  "ProductStatus": { "values": { "draft": "작성중" }, "cone": { "note": "판매 상태" } }
}
```

## Easily missed declarations

| Missing | Effect |
| --- | --- |
| `id` prop | Scaffolded model logic assumes it — `findById`, `save`, `del` |
| `created_at` prop | No creation timestamp; add with `dbDefault: "CURRENT_TIMESTAMP"` |
| `{EntityId}OrderBy` enum | `findMany` has nothing to sort by |
| `{EntityId}SearchField` enum | Search has no field to search |
| enum prop's `id` absent from `enums` | Sync fails — the prop references an undefined type |
| `id` on a `json` prop | Validation fails — `id` names the generated TypeScript type |
| `dimensions` on a `vector` prop | Validation fails — the column width is unknown |
