# Querying Traces

`Naite.get(pattern)` always returns a `NaiteQuery`. No matches produce an empty query rather than an
error.

## Keys and wildcard matching

Without `*`, a pattern is an exact key lookup. Wildcards operate on colon-delimited segments; they
are not glob or regular-expression matching:

| Pattern | Behavior |
| --- | --- |
| `puri:executed-query` | Exact key only |
| `puri:*` | Any key whose first segment is `puri`, including the bare key `puri` |
| `syncer:*:user` | Exactly three segments; only the middle segment varies |
| `*` | Every key in the current store |

A trailing `*` means prefix matching and accepts any remaining number of segments. A `*` anywhere
else replaces exactly one segment, and the pattern and key must have the same segment count.
Periods do not delimit wildcard segments, so `invoice.*` does not match `invoice.save`.

Exact-key results preserve append order. Wildcard lookup iterates keys in `Map` insertion order and
then appends every record for each matching key; it does not globally sort records by timestamp.
Do not treat `Naite.get("*").first()` as the earliest record across different keys.

## Filters

Every filter returns a new `NaiteQuery`, so filters can be chained without changing the original:

```typescript
const query = Naite.get("puri:executed-query")
  .fromFunction("findMany", { from: "indirect" })
  .where("data", "includes", 'from "invoices"');
```

| Filter | Exact behavior |
| --- | --- |
| `.fromFile(fileName)` | Keeps a trace when any stack frame path ends with `/<fileName>` |
| `.fromFunction(name)` | Keeps a trace when any stack frame function name contains `name` |
| `.fromFunction(name, { from: "direct" })` | Checks only `stack[0]`, the `Naite.t()` call site |
| `.fromFunction(name, { from: "indirect" })` | Checks `stack[1]` and later frames |
| `.fromFunction(name, { from: "both" })` | Checks the whole stack; this is the default |
| `.where(path, operator, value)` | Reads `path` from the raw trace, then applies the operator |

Function matching uses substring matching, not exact function-name matching. Anonymous stack frames
have no function name and cannot match `fromFunction()`.

`fromFile()` hardcodes the `/` separator in its suffix check. A captured Windows path containing
backslashes can therefore fail to match even when its basename is correct. For cross-platform
checks, use another supported filter such as
`.where("stack.0.filePath", "includes", "invoice.model.ts")` or `.fromFunction()`. When every stack
frame matters, inspect `getTraces()` and normalize each `frame.filePath` before filtering manually.

The root object seen by `where()` is `{ key, data, stack, at }`, so recorded object fields begin at
`data`:

```typescript
Naite.get("puri:ub-register")
  .where("data.tableName", "=", "invoices")
  .where("data.row.total", ">=", 1000)
  .result();
```

`=`, `!=`, `>`, `<`, `>=`, `<=`, and `includes` are supported. Equality is strict. Ordered
comparison runs only when both operands are strings or numbers. `includes` runs only when the
resolved trace value is a string.

## Result shapes

| Terminal method | Result |
| --- | --- |
| `.result()` | Recorded `data` values as an array |
| `.first()` / `.last()` | First or last recorded `data`, or `undefined` |
| `.at(index)` | `data` at the zero-based array index, or `undefined` |
| `.getTraces()` | Raw trace objects containing `key`, `data`, `stack`, and `at: Date` |

`getTraces()` exposes captured stack paths and mutable value references. Use it only when call-site
metadata is needed; assertions on values normally use `result()`, `first()`, `last()`, or `at()`.

`Naite.getAll()` returns an object keyed by every exact trace key. Ordinary values are arrays of
recorded data:

```typescript
Naite.getAll();
// { "invoice:save": [{ id: 1 }], "invoice:publish": [{ id: 1 }] }
```

Keys beginning with `mock:` are a compatibility exception: `getAll()` returns their raw trace
arrays, not data arrays. Prefer `Naite.get(key)` when code should have one stable result shape.
