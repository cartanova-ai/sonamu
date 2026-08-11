---
name: sonamu-naite
description: Records and inspects test traces in Sonamu. Use when instrumenting a failing path, asserting on Puri/UpsertBuilder internals, filtering traces, diagnosing missing or non-serializable output, or checking LogTape, Vitest metadata, CLI, and extension-socket exposure before recording sensitive data. Covers Naite.t/get, NaiteQuery, getAllTraces, sonamu/test contexts, and sonamu test --traces.
---

# Naite Test Tracing

Naite appends diagnostic values to the current Sonamu context while `NODE_ENV` is `"test"`.
Application code records through the public package entry point, and tests inspect the same
context through `NaiteQuery`:

```typescript
// Application code
import { Naite } from "sonamu";

Naite.t("invoice:save:result", { invoiceId });
```

```typescript
// Test code
import { Naite } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { expect, vi } from "vitest";

bootstrap(vi);

test("저장 결과를 기록한다", async () => {
  await saveInvoice();

  expect(Naite.get("invoice:save:result").first()).toMatchObject({ invoiceId: expect.any(Number) });
});
```

`Naite.t()` returns `void`; it does not wrap or return the recorded value. The current public
surface has no `p()`, `try()`, tag-selection, enable/config, or redaction API. Select records with
colon-delimited keys and `NaiteQuery` filters, and remove or mask sensitive fields before calling
`Naite.t()`.

## Reference Map

| Need | Read |
| --- | --- |
| Make records persist in a test; understand context isolation, storage, `del`, and silent no-ops | `references/recording-and-context.md` |
| Match exact/wildcard keys; filter by file, function, or data; understand every query result shape | `references/querying-traces.md` |
| Use framework-provided Puri, UpsertBuilder, migration, syncer, and template trace keys | `references/framework-traces.md` |
| Print/export traces; diagnose serialization failures; understand logging and privacy boundaries | `references/export-and-debugging.md` |

For general Model/API test setup, transactions, fixtures, and DevRunner operation, use
`sonamu-testing`.
