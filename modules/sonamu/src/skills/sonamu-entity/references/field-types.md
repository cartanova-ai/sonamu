# Field Types and Options

## Minimal Template

```json
{
  "id": "Product",
  "table": "products",
  "title": "Product",
  "props": [
    { "name": "id", "type": "integer", "desc": "ID" },
    {
      "name": "created_at",
      "type": "date",
      "dbDefault": "CURRENT_TIMESTAMP",
      "desc": "Created at"
    },
    { "name": "name", "type": "string", "length": 255, "desc": "Product name" }
  ],
  "indexes": [],
  "subsets": { "A": ["id", "name", "created_at"] },
  "enums": {
    "ProductOrderBy": { "id-desc": "Newest" },
    "ProductSearchField": { "id": "ID", "name": "Name" }
  }
}
```


## OrderBy enum

Scaffolded model code handles `id-desc` and nothing else, so every extra value in the enum at
scaffold time becomes an unhandled branch: scaffolding still succeeds, but the model's
`exhaustive()` call type-errors until you add the case by hand — and a missed case is a runtime
error, since the value is selectable from the UI.

```json
"ProductOrderBy": { "id-desc": "Newest" }
```

Starting with `id-desc` alone and adding sort options afterwards keeps that in step. Each addition
is two edits — the enum value, and the matching branch in the model:

```typescript
// model.ts — adding orderBy cases
if (params.orderBy === "id-desc") {
  qb.orderBy("products.id", "desc");
} else if (params.orderBy === "name-asc") {
  qb.orderBy("products.name", "asc");
} else {
  exhaustive(params.orderBy);
}
```

## integer vs number

Picking the wrong one costs an ALTER migration later, since the two map to different PostgreSQL
column types:

- `integer` → DB `integer` (whole numbers)
- `number` → DB `numeric(p,s)` (precise decimal numbers)

| Use case                                | Entity type                       | Example                          |
| --------------------------------------- | --------------------------------- | -------------------------------- |
| PK, FK, count, order, quantity          | `integer`                         | id, user_id, order_num, quantity |
| Amount, ratio, values requiring decimal | `number` (+ `precision`, `scale`) | price, rate, weight, score       |

The question that decides it: does this value ever need a decimal point? No → `integer`. Yes →
`number`, with `precision` and `scale` given (omitting them leaves the precision to the driver's
default).

```json
{ "name": "order_num", "type": "integer", "desc": "Sort order" }
{ "name": "quantity", "type": "integer", "desc": "Quantity" }
{ "name": "price", "type": "number", "precision": 12, "scale": 2, "desc": "Price" }
{ "name": "rate", "type": "number", "precision": 5, "scale": 2, "desc": "Rate" }
```

## Common Options (CommonProp)

Options applicable to all prop types:

| Option     | Type    | Description                                               |
| ---------- | ------- | --------------------------------------------------------- |
| `name`     | string  | Field name (required)                                     |
| `desc`     | string  | Field description                                         |
| `nullable` | boolean | Whether NULL is allowed (default: false)                  |
| `toFilter` | true    | Register as a sonamuFilter filtering target. See model.md |
| `cone`     | Cone    | LLM-based fixture generation metadata. See cone.md        |

## Required Options by Type

| Type         | Required     | Optional                                                           |
| ------------ | ------------ | ------------------------------------------------------------------ |
| `string`     | —            | `length` (text if omitted), `zodFormat` (email, uuid, etc.)        |
| `integer`    | —            | —                                                                  |
| `bigInteger` | —            | —                                                                  |
| `number`     | —            | `precision`, `scale`, `numberType` (real/double precision/numeric) |
| `numeric`    | —            | `precision`, `scale`                                               |
| `enum`       | `id`         | `nullable`, `dbDefault`, `length`                                  |
| `json`       | `id`         | `dbDefault: "{}"`                                                  |
| `date`       | —            | `dbDefault`, `precision`                                           |
| `boolean`    | —            | `dbDefault: "false"`                                               |
| `virtual`    | `id`         | `virtualType` (query/code, default: code)                          |
| `vector`     | `dimensions` | —                                                                  |
| `tsvector`   | —            | —                                                                  |

## ENUM dbDefault

An enum default goes in the JSON as an escaped double-quoted string. The quotes survive into the
generated migration, which is what makes the value a literal:

```json
{
  "name": "status",
  "type": "enum",
  "id": "ApprovalStatus",
  "dbDefault": "\"pending\"",
  "desc": "Approval status"
}
```

→ `"status" text not null default 'pending'`

The two ways it goes wrong:

- `"dbDefault": "pending"` — unquoted, PostgreSQL reads it as a column reference and rejects the
  DEFAULT expression
- `"dbDefault": "'pending'"` — single quotes make the generated file fail oxfmt
