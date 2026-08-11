# Export, Debugging, and Privacy

## `getAllTraces()` output

`Naite.getAllTraces()` flattens the current store and returns `SerializedTrace[]`:

```typescript
type SerializedTrace = {
  key: string;
  value: any;
  filePath: string;
  lineNumber: number;
  at: string;
};
```

`filePath` and `lineNumber` come from the first captured stack frame, and `at` is an ISO timestamp.
The method clones each value with `JSON.parse(JSON.stringify(value ?? ""))`; it does not use
structured clone.

| Recorded top-level value | Exported value or effect |
| --- | --- |
| JSON-safe primitive, array, or plain object | JSON-round-tripped clone |
| `Date` | ISO string |
| `null` or `undefined` | Empty string |
| `NaN` or `Infinity` | `null` |
| `Map` or `Set` | Empty object unless it supplies custom JSON behavior |
| `BigInt` | `JSON.stringify` throws |
| Circular object | `JSON.stringify` throws |
| Function or symbol | Export can fail because `JSON.stringify` produces `undefined` |

Inside an object, properties whose values are `undefined`, functions, or symbols are omitted by
JSON serialization; the same values in an array become `null`. A successful export can therefore
still have a different shape from the raw value returned by `Naite.get()`.

Before mapping the result, Sonamu checks values and prints a prominent warning for types its
serializability check rejects. That check is advisory: it allows some values that JSON cannot
round-trip, including `BigInt` and circular references, and export still throws. Record a
JSON-round-trippable projection when traces will leave the in-memory query API.

The `test` and `testAs` wrappers call `getAllTraces()` after both successful and failed callbacks so
Vitest metadata contains traces. A serialization error at that point can fail an otherwise passing
test or replace the original failure. If the reported error comes from JSON serialization, reduce
the trace payload before changing the business value being tested.

## Focused CLI debugging

Direct `Naite.get()` assertions need no reporter configuration. To print the serialized metadata
collected for each test through DevRunner, enable its server route and use the trace flag:

```typescript
// sonamu.config.ts
import { defineConfig } from "sonamu";

export default defineConfig({
  test: {
    devRunner: { enabled: true },
  },
});
```

```bash
pnpm sonamu test invoice.model --pattern "save" --traces
# Short flags
pnpm sonamu test invoice.model -p "save" -t
```

The command calls the running Sonamu DevRunner. If the feature is disabled, it reports that
`test.devRunner.enabled: true` is required; if the dev server is unavailable, it reports that it
cannot connect. `--traces` controls CLI printing, not collection.

`bootstrap(vi)` independently registers an after-each hook that calls
`NaiteReporter.reportTestResult()` with each test result and its captured traces. Outside CI, that
hook attempts local extension-socket delivery whenever it runs; it does not depend on the Vitest
reporter list.

`NaiteVitestReporter`, imported from `sonamu/test`, only calls `NaiteReporter.startTestRun()` and
`endTestRun()` for run-boundary messages. Removing it from Vitest reporters removes those start/end
messages but does not disable the per-test socket delivery registered by `bootstrap(vi)`. All three
`NaiteReporter` methods return before socket delivery in CI. Vitest metadata capture and DevRunner
trace responses are separate from both socket paths.

## Privacy boundaries

Naite does not redact, sample, or filter recorded values. A recorded value can reach:

- the in-memory context store and raw `NaiteQuery` results;
- a LogTape debug record under category `["naite", ...keySegments]` when configured loggers accept
  that category; category segments split the key on both `.` and `:`;
- Vitest task metadata and DevRunner API/CLI output after JSON export;
- the local extension socket outside CI whenever the `bootstrap(vi)` after-each hook reports a test;
  this per-test path does not require `NaiteVitestReporter`.

Raw traces also contain source file paths and stack frames. Record identifiers and the minimum
diagnostic fields needed for the assertion; mask secrets, credentials, tokens, personal data, and
large request/response bodies before `Naite.t()`.
