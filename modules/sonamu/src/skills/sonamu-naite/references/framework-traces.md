# Framework Trace Keys

These keys are emitted by current Sonamu framework call sites. They are ordinary Naite keys: they
exist only in test mode and only in the context that executes the instrumented operation.

## Puri

`puri:executed-query` records the SQL string when a Puri or resolved Puri builder executes through
its Promise-compatible `then()` path. This is the stable starting point for checking generated SQL:

```typescript
await InvoiceModel.findMany("A", { status: "open" });

const sql = Naite.get("puri:executed-query").last();
expect(sql).toContain('from "invoices"');
```

## UpsertBuilder

| Key | Emission point and data |
| --- | --- |
| `puri:ub-register` | Every `register()`: `{ tableName, uuid, isUuidReused, row }` |
| `puri:ub-ref-resolved` | Each self/cross-table `UBRef` substitution: `{ tableName, field, from, to }` |
| `puri:ub-inherit` | When `inherit` actually excludes update columns: `{ tableName, inheritColumns, excludedFromUpdate }` |
| `puri:ub-clean-orphans` | After the orphan-delete query runs: `{ tableName, cleanOrphans, deletedCount }` |
| `puri:ub-upserted` | After successful upsert/insert: `{ tableName, mode, rowCount, returnedIds }` |
| `puri:ub-batch-updated` | After successful `updateBatch()`: `{ tableName, rowCount, whereColumns }` |

Conditional keys are evidence that their branch ran, not a complete event stream. For example,
`puri:ub-clean-orphans` is absent when any selected foreign-key value set is empty and no delete
query runs.

## Migration, syncer, and templates

Migration instrumentation uses these exact key groups:

| Key | Data |
| --- | --- |
| `migrator:getMigrationCodes:results` | Discovered migration-code descriptors |
| `migrator:getStatus:codes` | Code descriptors passed into status calculation |
| `migrator:getStatus:status` | Per-target migration status value |
| `migrator:getStatus:conns` | Calculated target statuses |
| `migrator:getStatus:preparedCodes` | Codes prepared from schema comparison |
| `migrator:runAction:action`, `migrator:runAction:targets`, `migrator:runAction:result` | Requested action, target keys, and final result |
| `migrator:generatePreparedCodes:preparedCodes` | Prepared codes about to be written |
| `migrator:compareMigrations:entitySet:<table>`, `migrator:compareMigrations:dbSet:<table>` | Entity and database migration sets for one table |
| `migrator:generateAlterCode_ColumnAndIndexes:debug` | Counts used when non-empty column/index changes are generated |
| `migrator:generateAlterCode_Foreigns:fkChangeCodeGenerationError` | `{ table, entityForeigns, dbForeigns }` before the generation error is thrown |

Use an exact key for a specific phase or `Naite.get("migrator:*")` to inspect all current migration
records. Some payloads contain generated source, schema details, or local paths; apply the export and
privacy boundaries before printing them.

Sync and generation instrumentation currently includes:

- `handleTruthSourceChanges`, `handleImplementationChanges`, and
  `handleAuxiliarySymbolChanges`, each with `{ diffGroups }`;
- `actionSyncConfig` with `{ content }` and `actionGenerateServices` with its params array;
- `generateTemplate`, `renderTemplate`, `resolveRenderedTemplate<key>`,
  `resolveRenderedTemplate:beforeFormat`, and `resolveRenderedTemplate:formatted:<key>`;
- `Template__generated:sourceCodes` and `Template__generated:body`.

Some generator keys concatenate a template key instead of using colon segments. Query those by the
exact observed key; colon wildcards do not match an arbitrary string suffix.

### Shared `render` key

Both the Model template and the per-entity service template emit the exact key `render`. Their
payloads differ:

| Emitter | Data |
| --- | --- |
| Model template | `{ entityId }` |
| Service template | `{ namesRecord }` |

`Naite.get("render").result()` can therefore mix both shapes when both templates render in the same
context. Select by payload instead of assuming a homogeneous result:

```typescript
const modelRenders = Naite.get("render").where("data.entityId", "=", "Invoice").result();
const serviceRenders = Naite.get("render")
  .where("data.namesRecord.capital", "=", "Invoice")
  .result();
```

`esq-query`, `fs/promises:*`, and `mock:*` are not framework-wide built-ins. They appear only when a
project model or test mock explicitly calls `Naite.t()` with those names. Use a project-owned key
for custom instrumentation:

```typescript
import { Naite } from "sonamu";

Naite.t("invoice:save:decision", {
  mode,
  rowCount: rows.length,
});
```
