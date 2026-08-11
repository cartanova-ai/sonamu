# How a Fixture Value Is Produced

Read this when a generated value is wrong, unrealistic, or silently ignored the cone key you set.

## Per-prop resolution order

For each non-virtual prop, in order:

1. **`overrides`** — the key passed to `generate()`. For a `BelongsToOne` or `OneToOne` with a join
   column, use the FK name (`author_id`). A prop-name override such as `author` is accepted during
   generation but silently discarded when the fixture row is converted for insertion.
2. **Relation branch** — any relation prop is resolved here and skips every step below.
3. **`cone.note` + LLM** — only when `--use-llm` is on.
4. **`cone.fixtureGenerator`** — a faker expression.
5. **`cone.fixtureDefault`** — used as-is.
6. **Type/field-name default** — the faker mapping.

Because relations are handled at step 2, `cone.note` and `--use-llm` never apply to a relation prop.
`cone.dataSource` is the only cone key that shapes a relation value.

The `id` prop is generated before all of this and ignores cone entirely — see "id props" below.

Two post-processing passes then run over the finished row.

## Post-processing that overwrites what you set

**Email is rebuilt from the name.** If the row has an `email` and any of `name`, `username`,
`full_name`, or `name_en`, the local part of the email is replaced with the romanized name, keeping
only the domain. Korean names are transliterated; ASCII names are lowercased with spaces turned into
dots. So `cone.fixtureGenerator: "faker.internet.email()"` on an entity that also has a `name` prop
produces a name-derived address, not a faker one. Passing `email` in `overrides` is the only way to
keep an exact value.

**Password is hashed.** A non-empty string `password` is replaced with its **bcrypt** hash at cost
10. A test that signs in with the plaintext value needs a bcrypt verifier. This is unconditional and
independent of cone.

## `fixtureGenerator` accepts only `faker.*`

The expression is parsed, not evaluated — there is no `eval`, and only a literal `faker.` prefix is
recognized. Anything else is skipped with a warning and falls through to normal default generation,
including entity-specific and field-name mappings before the per-type default:

```
Unsupported generator expression for name: fakerKO.person.fullName(). Only faker.* expressions are supported. Using default value.
```

`fakerKO.*` and `fakerJA.*` are therefore **not usable in `cone.fixtureGenerator`**, even though the
framework's own built-in mappings are written that way. Write `faker.*`; only props named exactly
`name` or `username` execute it with `fakerKO`. Every other prop uses the base faker instance, so a
custom generator for `company_name` or `display_name` does not guarantee Korean output.

A valid path that throws at call time (bad arguments, not a function) falls back through the normal
default chain — entity-specific handling, field-name mappings, then the type default — with `Failed
to execute generator "..." for <prop>, falling back to default:`.

## Field-name matching is substring-based

With no cone key, the prop name is lowercased, underscores are stripped, and the result is tested
with `includes()` against the locale's pattern table **in declaration order** — first match wins.
Patterns include `email`, `username`, `name`, `firstname`, `lastname`, `phone`, `mobile`, `address`,
`city`, `country`, `zipcode`, `company`, `department`, `position`, `jobtitle`, and more.

`name` sits near the front, so every prop whose name merely *contains* it — `company_name`,
`file_name`, `display_name` — gets a Korean person's full name. Set `cone.fixtureGenerator` or
`cone.fixtureDefault` on those props to opt out.

Locale is fixed to `ko` from the CLI, so the Korean table is always the one in use.

After the pattern table: JSON array props get array values, `enum` picks a random declared value
(falling back to `null` when nullable, otherwise the literal string `"UNKNOWN"` when the enum has no
values), `vector`/`tsvector` always produce `null`, and everything else takes the per-type default.

**An entity whose id is literally `Department` with a prop named `name`** hits a hardcoded branch
before all of that: a Korean department name from a fixed list, with a prefix 30% of the time, a
suffix 30%, and the bare name 40%. That variation exists to spread values under a unique constraint.
No other entity name triggers it, and it cannot be configured.

## LLM generation

Only props with a non-empty `cone.note` enter the LLM branch. Relation props and the `id` prop are
excluded from row-level batching. A prop with `cone.fixtureGenerator` is also excluded from that
shared row request, but it still takes the single-field LLM fallback when `--use-llm` is on; the
generator runs only if that LLM attempt fails. Correlated props that must agree with each other
should therefore carry only `note`, so they are generated together in the shared row request.

Per row, all eligible props are generated in one call so correlated fields stay consistent. The
prompt carries more than the note being asked about: the entity's own `cone.note`, every eligible
prop's name, type and note, the allowed values of any enum among them, and a context list of the
entity's remaining non-relation props with their notes, marked not to be generated.

The response is cached under `rowKey:fieldName` so the rest of that row's props read it back without
another call. That caching is unconditional — `--no-cache` does not affect it. What `--no-cache`
disables is the second cache, keyed by entity, prop, and note text, used only by the single-field
path — the retry for a field the row response left out. A prop that is the only eligible one on its
entity still goes through the row call, so that is not what triggers the fallback. Both caches live
on the `FixtureGenerator` instance and die with it.

A string longer than the prop's declared `length` is truncated silently.

The API key is read from `Sonamu.secrets.anthropic_api_key`, then from the `ANTHROPIC_API_KEY`
environment variable. Sonamu's standard secret initialization fills that property from the same
environment variable; it is not a `sonamu.config.ts` key. A missing key throws inside the LLM step,
which is caught per prop: a warning is printed and generation continues down the chain to
`fixtureGenerator`, `fixtureDefault`, and the type default. So a run with no key still succeeds and
produces faker data.

```
[FixtureGenerator] LLM generation failed for User.bio, falling back to fixtureGenerator or default
```

## id props

Cone is not consulted when generating the id value. The decision is made from the prop type:

| id prop                                                       | Behavior                                              |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `integer` / `bigInteger`                                      | Left to the DB sequence; a temporary id links records during insert |
| `string` with `nextval` and `fixtureStrategy: "sequence"`     | Left to the DB sequence; a temporary id links records during insert |
| `string` with `nextval` but no sequence strategy              | A temporary numeric id is inserted explicitly, bypassing the DB default |
| `string` (anything else)                                      | `alphanumeric(32)`, the better-auth shape              |
| `uuid`                                                        | A generated UUID                                       |

## Entities with `parentId`

A subtype entity does not get new parent rows. Generation queries the parent table for ids that have
no subtype row yet, applies `cone.fixtureParentOverrides` from the id prop as a `WHERE` filter, and
reuses up to `--count` of them. When none are free it warns and produces nothing for that entity —
the command still exits successfully with fewer rows than asked for:

```
[parentId] Achievement: 서브타입이 없는 부모 레코드가 부족합니다. 건너뜁니다.
```

Generate parents first, or loosen `fixtureParentOverrides`.

## Sequence reset

Sequences are reset automatically after inserting fixtures and again during `fixture sync`, to
`COALESCE(MAX(id), 1)` per table. No manual `setval` is needed.

Reset only runs when the id prop is `integer`/`bigInteger`, or is a string carrying
`cone.fixtureStrategy: "sequence"`. Any other string PK is skipped, and the skip is reported:

```
Skipped sequence reset for accounts (id type: string)
```

That message is expected for random string PKs. It signals a real problem only when the table's id
*is* backed by a DB sequence — then add `fixtureStrategy: "sequence"` to its id prop, or the next
real insert collides with a fixture id.

## Failures and what they mean

| Message | Cause | Fix |
| --- | --- | --- |
| `FixtureGenerator: X.y에 필요한 Z 데이터가 없습니다.` | Non-nullable relation with no rows to point at in the fixture DB | Generate `Z` in an earlier command, or give the prop a `cone.dataSource` |
| `템플릿 필드 "x"이(가) 부모 fixture 데이터에 존재하지 않습니다` | A `{{x}}` in `fixtureCompanions.overrides` names a prop the parent lacks | Use a prop that exists on the parent |
| `[Companion] No BelongsToOne relation from A to B. Skipping.` | The companion entity has no FK back to the parent | Add the `BelongsToOne` to the companion, or drop the declaration |

The last two come from `fixtureCompanions`; the key itself is documented in `cone.md`.

The two constraint violations below reach you straight from the database, so the message names the
column but not the reason. Each has more than one cause.

### `duplicate key value violates unique constraint`

`fixture gen` does not clear the fixture DB. Existing-row lookup depends on whether the generated row
keeps an explicit id:

- An `integer`/`bigInteger` id, or a string id with `fixtureStrategy: "sequence"`, is omitted before
  insert. For those rows, every unique index declared on the entity is used to find an existing id,
  and the row is updated on that id.
- A random string or UUID id stays in the row. The unique lookup is skipped, and conflict handling
  checks only that newly generated id. Rerunning generation with an existing unique value can
  therefore violate the unique constraint even when the index is declared on the entity.

If the PK uses a sequence, check these remaining causes:

1. **Two rows inside this run.** The batch reuses an internal reference for matching unique values,
   but it still sends both rows to the database. This is likely when the value comes from a small
   pool — an `enum`, the hardcoded department names, or a faker person name at a high `--count`.
2. **The database constraint is absent from the entity's indexes.** A database-only constraint does
   not participate in the existing-row lookup and is first seen at insert time.

For repeated random string/UUID fixtures or same-batch collisions, use a more varied
`cone.fixtureGenerator` such as `faker.string.alphanumeric(12)`, or lower `--count`. For a
database-only constraint, bring the entity index definition back in sync instead of changing
otherwise-correct generated values.

### `violates foreign key constraint`

1. **An override naming a row that does not exist.** A relation's `<prop>_id` override is written into
   the row with no lookup. Nothing validates the id, so a hand-written `fixtureCompanions.overrides`
   entry, or an id passed to the generator directly, fails at insert. Check this first: it is the one
   cause that regenerating cannot fix. Do not use the relation prop name here; that form is silently
   discarded during fixture conversion.
2. **The referenced rows are in another database.** `gen` reads and writes the fixture DB only,
   while `fetch` reads the current environment. Rows visible to one command are not necessarily
   visible to the other.
