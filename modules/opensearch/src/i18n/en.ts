// Source catalogue: other catalogues follow its keys and parameter shapes. Parameters never carry bodies or credentials.

type IndexNameKind = "physicalIndex" | "writeAlias";

function quoted(value: string): string {
  return JSON.stringify(value);
}

export const searchMessagesEn = {
  "error.notConfigured": "Search is not configured for this target.",
  "error.unavailable": "OpenSearch is unavailable.",
  "error.timeout": "The operation did not finish within its time limit.",
  "error.queryInvalid": "The search request is not allowed.",
  "error.definitionMismatch": "This process does not support the fingerprint of the read target.",
  "error.rebuildRequired": "Capture is suspended; a new target must be built and cut over.",
  "error.notReady": "There is no read target yet.",
  "error.stopping": "The handle is stopping and accepts no new work.",
  "error.inTransaction": "Managed search cannot run inside an active application transaction.",
  "error.catalogUnavailable": "The PostgreSQL search catalog could not be read.",
  "error.cursorExpired": "The cursor has expired or does not match its search.",
  "error.configuration": "The configuration is invalid.",
  "error.schemaMissing": "The search schema or one of its tables does not exist.",
  "error.schemaVersionMismatch": "The installed search schema version or checksum does not match.",
  "error.invalidTransaction": "A live transaction is required.",
  "error.storeMismatch": "The transaction belongs to a different search store.",
  "error.noWriteTarget": "Capture is active but no write target is registered.",
  "error.invalidDocumentId": "The document ID is invalid.",
  "error.revisionOverflow": "The revision would exceed Number.MAX_SAFE_INTEGER.",
  "error.revisionDivergence": "The indexed version diverges from the revision ledger.",
  "error.projection": "The projection failed.",
  "error.targetUnavailable": "The target index or its write alias is unavailable.",
  "error.adminBusy": "Another administrative operation holds the lease.",
  "error.adminLeaseLost": "The administrative lease was lost.",
  "error.adminPreconditionFailed": "A precondition of the administrative operation failed.",

  "names.invalidSchema": (params: { name: string }) =>
    `Schema name ${quoted(params.name)} must match ^[a-z_][a-z0-9_]{0,62}$.`,
  "names.reservedSchema": (params: { name: string }) =>
    `Schema name ${quoted(params.name)} is reserved and cannot be used as the package schema.`,
  "names.invalidNamespace": (params: { name: string }) =>
    `Namespace ${quoted(params.name)} must match ^[a-z0-9][a-z0-9-]{0,62}$.`,
  "names.invalidLogicalKey": (params: { name: string }) =>
    `Logical key ${quoted(params.name)} must match ^[a-z0-9][a-z0-9-]{0,62}$.`,
  "names.invalidTargetId": (params: { name: string }) =>
    `Target ID ${quoted(params.name)} must be a lowercase canonical UUID.`,
  "names.indexNameTooLong": (params: { kind: IndexNameKind; bytes: number; maxBytes: number }) =>
    `The ${params.kind === "writeAlias" ? "write alias" : "physical index"} name exceeds ${params.maxBytes} bytes (${params.bytes} bytes).`,
  "names.invalidPhysicalIndex": (params: { name: string }) =>
    `Physical index name ${quoted(params.name)} is not in the form snm-<namespace>-<logical key>-<uuid>.`,
  "names.invalidWriteAlias": (params: { name: string }) =>
    `Write alias name ${quoted(params.name)} is not in the form <physical index>-w.`,
  "documentId.empty": "The document ID is empty.",
  "documentId.nul": "The document ID contains a NUL character.",
  "documentId.illFormed": "The document ID contains an unpaired UTF-16 surrogate.",
  "documentId.tooLong": (params: { bytes: number; maxBytes: number }) =>
    `The document ID exceeds ${params.maxBytes} UTF-8 bytes (${params.bytes} bytes).`,

  "canonicalJson.invalidValue": (params: { reason: string; path: string }) =>
    `The value cannot be canonicalized as JSON: ${params.reason} at "${params.path}".`,
  "projection.invalidResult":
    'A projection result must be { state: "present", document } or { state: "deleted" }.',
  "projection.documentNotObject": "The document of a present projection must be a JSON object.",
  "projection.invalidDocument": (params: { reason: string; path: string }) =>
    `The projected document cannot be canonicalized as JSON: ${params.reason} at "${params.path}".`,
  "projection.reservedField": (params: { field: string }) =>
    `Top-level document field ${quoted(params.field)} is reserved (sonamu_meta and names starting with _).`,
  "revision.overflow": "The revision exceeds Number.MAX_SAFE_INTEGER.",
  "revision.invalid": "A revision must be a safe integer of at least 1.",

  "definition.notObject": "A search definition must be an object.",
  "definition.unknownKey": (params: { key: string }) =>
    `The search definition has an unknown key ${quoted(params.key)}.`,
  "definition.invalidLogicalKey": "The logical key of a search definition must be a string.",
  "definition.invalidProjectionVersion": (params: { maxLength: number }) =>
    `projectionVersion must be a string of 1 to ${params.maxLength} characters without surrounding whitespace or control characters.`,
  "definition.invalidSchema": "schema must implement Standard Schema v1.",
  "definition.missingFunction": (params: { field: string }) =>
    `${params.field} of the search definition must be a function.`,
  "definition.settingsNotObject": "settings must be a JSON object.",
  "definition.invalidPart": (params: { field: string; reason: string; path: string }) =>
    `${params.field} cannot be canonicalized as JSON: ${params.reason} at "${params.path}".`,
  "definition.invalidRequiredPlugins": (params: { maxLength: number }) =>
    `requiredPlugins must be an array of strings of 1 to ${params.maxLength} characters without surrounding whitespace or control characters.`,
  "definition.duplicateRequiredPlugin": "requiredPlugins contains a duplicate name.",
  "definition.unsupportedHashVersion": (params: { supported: string }) =>
    `This package only supports hash version ${params.supported}.`,
  "mappings.notObject": "mappings must be an object of the form { properties, dynamic? }.",
  "mappings.unsupportedKey": (params: { key: string }) =>
    `Top-level mapping key ${quoted(params.key)} is not supported. Application mappings live under doc, so only properties and dynamic are accepted.`,
  "mappings.propertiesNotObject": "mappings.properties must be an object.",
  "mappings.reservedProperty": (params: { property: string }) =>
    `Mapping property ${quoted(params.property)} uses a reserved name (sonamu_meta and names starting with _).`,
  "mappings.invalidDynamic": "mappings.dynamic is not an OpenSearch dynamic setting.",
  "indexMeta.invalidFingerprint": "A fingerprint must be a lowercase SHA-256 hex string.",

  "i18n.invalidLocale": (params: { locale: string }) =>
    `Locale ${quoted(params.locale)} is not a BCP 47 language tag.`,
  "i18n.unknownMessageKey": (params: { key: string }) =>
    `Message key ${quoted(params.key)} does not exist.`,
  "i18n.invalidMessage": (params: { key: string }) =>
    `Message ${quoted(params.key)} must be a string or a function returning a string.`,

  "sql.invalidIdentifier": (params: { name: string }) =>
    `SQL identifier ${quoted(params.name)} must match ^[a-z_][a-z0-9_]{0,62}$.`,
  "sql.invalidFragment":
    "Only validated SQL fragments can be interpolated into package SQL; values must be bind parameters.",
  "sql.invalidPlaceholders": (params: { placeholders: number; values: number }) =>
    `The statement references ${params.placeholders} distinct placeholders but has ${params.values} values.`,
  "sql.invalidTimeout": (params: { setting: string }) =>
    `Timeout ${params.setting} must be a positive integer number of milliseconds.`,

  "schema.invalidOptions": "The schema options are invalid.",
  "schema.notInstalled": (params: { schema: string }) =>
    `The search schema ${quoted(params.schema)} is not installed. Run installSearchSchema in a migration first.`,
  "schema.ahead": (params: { installed: number; supported: number }) =>
    `The installed search schema version ${params.installed} is newer than version ${params.supported} supported by this package. Downgrades are not supported.`,
  "schema.behind": (params: { installed: number; required: number }) =>
    `The installed search schema version ${params.installed} is older than the required version ${params.required}. Run installSearchSchema.`,
  "schema.checksumMismatch": (params: { version: number }) =>
    `The installed search schema version ${params.version} has a different checksum than this package.`,
  "schema.versionGap": (params: { version: number }) =>
    `Search schema version ${params.version} is missing from schema_versions; the schema was not created by this package.`,
  "schema.invalidRow": (params: { table: string }) =>
    `A row of ${params.table} in the search schema has an unexpected shape.`,
  "schema.isolationNotReadCommitted": (params: { isolation: string }) =>
    `The search schema must be installed in a READ COMMITTED transaction, not ${params.isolation}.`,

  "grants.noRoles": "At least one role is required to grant search schema privileges.",
  "grants.duplicateRole": (params: { role: string }) =>
    `Role ${quoted(params.role)} appears more than once; each role belongs to exactly one group.`,
  "grants.reservedRole": (params: { role: string }) =>
    `Role ${quoted(params.role)} is reserved and cannot receive search schema privileges.`,

  "pg.transactionConflict": (params: { sqlstate: string }) =>
    `The transaction conflicted with a concurrent transaction (SQLSTATE ${params.sqlstate}); retry the whole transaction.`,
  "pg.lockTimeout": (params: { sqlstate: string }) =>
    `The statement timed out or was canceled while waiting (SQLSTATE ${params.sqlstate}).`,
  "pg.schemaMissing": (params: { sqlstate: string }) =>
    `The search schema or one of its tables does not exist (SQLSTATE ${params.sqlstate}).`,
  "pg.insufficientPrivilege": (params: { sqlstate: string }) =>
    `The database role lacks a privilege the statement needs (SQLSTATE ${params.sqlstate}).`,
  "pg.readOnlyTransaction": "The statement cannot write in a read-only transaction.",
  "pg.failedTransaction": "The transaction has already failed and must be rolled back.",
  "pg.checkViolation": (params: { constraint: string }) =>
    `A row violated check constraint ${quoted(params.constraint)}.`,
  "pg.revisionOutOfRange": (params: { constraint: string }) =>
    `A revision is outside the safe integer range (constraint ${quoted(params.constraint)}).`,
  "pg.duplicateObject": (params: { sqlstate: string }) =>
    `A database object with the same name already exists (SQLSTATE ${params.sqlstate}).`,
  "pg.undefinedObject": (params: { sqlstate: string }) =>
    `A referenced database object, such as a role, does not exist (SQLSTATE ${params.sqlstate}).`,
  "pg.unavailable": (params: { sqlstate: string }) =>
    `PostgreSQL is unavailable (SQLSTATE ${params.sqlstate}).`,
  "pg.driverError": "The PostgreSQL driver failed before the server returned a result.",
  "pg.statementFailed": (params: { sqlstate: string }) =>
    `The PostgreSQL statement failed (SQLSTATE ${params.sqlstate}).`,

  "sync.invalidOptions": (params: { path: string }) =>
    `Synchronization option ${quoted(params.path)} is invalid.`,
  "sync.invalidPrimary":
    "getPrimaryDatabase must return a Knex instance or a live Knex transaction.",
  "sync.primaryResolverFailed": "getPrimaryDatabase failed while resolving the primary database.",
  "sync.initializeAborted": "initialize() was aborted before the store identity was read.",
  "sync.initializeStoreMismatch": (params: { expected: string; actual: string }) =>
    `The configured primary holds search store ${params.actual}, but expectedStoreId is ${params.expected}.`,
  "sync.notTransaction":
    "markChanged requires a live Knex transaction; the supplied handle is not a transaction.",
  "sync.completedTransaction": "The transaction supplied to markChanged has already completed.",
  "sync.storeIdentityUninitialized":
    "The search store identity is not established. Configure expectedStoreId or await synchronization.initialize() before marking changes.",
  "sync.invalidMarkInput": (params: { field: string }) =>
    `markChanged argument ${quoted(params.field)} is invalid.`,
  "sync.tooManyIds": (params: { count: number; max: number }) =>
    `markChanged received ${params.count} IDs; at most ${params.max} are allowed per call.`,
  "sync.logicalKeyNotRegistered": (params: { namespace: string; logicalKey: string }) =>
    `Logical key ${quoted(params.logicalKey)} is not registered in namespace ${quoted(params.namespace)}.`,
  "sync.storeMismatch": (params: { expected: string; actual: string }) =>
    `The transaction belongs to search store ${params.actual}, but this synchronization is bound to store ${params.expected}.`,
  "sync.noWriteTarget": (params: { namespace: string; logicalKey: string }) =>
    `Capture is active for ${quoted(params.logicalKey)} in namespace ${quoted(params.namespace)}, but no write target is registered.`,
  "sync.invalidRow": (params: { statement: string }) =>
    `Statement ${params.statement} returned a row with an unexpected shape.`,

  "delivery.invalidInput": (params: { operation: string; field: string }) =>
    `Delivery store operation ${params.operation} received an invalid ${quoted(params.field)}.`,
  "delivery.invalidRow": (params: { statement: string }) =>
    `Delivery statement ${params.statement} returned a row with an unexpected shape.`,

  "heartbeat.invalidInput": (params: { field: string }) =>
    `Worker heartbeat received an invalid ${quoted(params.field)}.`,

  "bulk.invalidLimit": (params: { name: string }) =>
    `The worker limit ${quoted(params.name)} is invalid for bulk delivery or backoff.`,

  "sonamu.notInitialized": "Sonamu's database configuration has not been initialized.",
  "sonamu.primaryIsTransaction":
    "The Sonamu primary database resolved to a transaction (Sonamu test mode shares one); a pooled Knex instance is required here.",
  "sonamu.noActiveTransaction":
    'markChanged needs an active Sonamu "w" transaction (@transactional or puri.transaction()); it never opens one.',
  "sonamu.notTransactionWrapper": "markChangedIn requires a PuriTransactionWrapper.",
  "sonamu.invalidSynchronization":
    "createSonamuSynchronization requires a synchronization with a markChanged method.",

  "sonamu.projectionScopeNotTransaction":
    "withProjectionScope requires the live snapshot transaction supplied to the projection.",

  "lifecycle.invalidOptions": (params: { path: string }) =>
    `The search lifecycle option ${quoted(params.path)} is invalid.`,

  "snapshot.invalidPrimary": "The primary database for a snapshot must be a Knex instance.",
  "snapshot.primaryIsTransaction":
    "A snapshot needs a pooled Knex instance; Knex ignores isolation and read-only options on a nested transaction.",
  "snapshot.invalidTimeouts": (params: { field: string }) =>
    `Snapshot timeout ${quoted(params.field)} must be an integer number of milliseconds between 1 and 2147483647.`,
  "snapshot.notRepeatableRead": (params: { isolation: string }) =>
    `The snapshot transaction runs at ${params.isolation} instead of repeatable read.`,
  "snapshot.notReadOnly": "The snapshot transaction is not read-only.",
  "snapshot.onReplica":
    "The snapshot transaction runs on a replica; projections must read the primary.",
  "snapshot.invalidRow": (params: { statement: string }) =>
    `Snapshot statement ${params.statement} returned a row with an unexpected shape.`,

  "limits.unknownField": (params: { field: string }) =>
    `Unknown worker limit ${quoted(params.field)}.`,
  "limits.invalidValue": (params: { field: string }) =>
    `Worker limit ${quoted(params.field)} is missing or out of range.`,
  "limits.heartbeatTooLong": (params: { heartbeatIntervalMs: number; leaseDurationMs: number }) =>
    `heartbeatIntervalMs (${params.heartbeatIntervalMs} ms) must be at most half of leaseDurationMs (${params.leaseDurationMs} ms).`,
  "limits.timeoutExceedsLease": (params: {
    field: string;
    timeoutMs: number;
    leaseDurationMs: number;
  }) =>
    `${params.field} (${params.timeoutMs} ms) must be shorter than leaseDurationMs (${params.leaseDurationMs} ms).`,
  "limits.retryDelayInverted": (params: { retryBaseDelayMs: number; retryMaxDelayMs: number }) =>
    `retryBaseDelayMs (${params.retryBaseDelayMs} ms) must not exceed retryMaxDelayMs (${params.retryMaxDelayMs} ms).`,
  "limits.retryAgeTooSmall": (params: { maxRetryAgeMs: number; retryBaseDelayMs: number }) =>
    `maxRetryAgeMs (${params.maxRetryAgeMs} ms) must exceed retryBaseDelayMs (${params.retryBaseDelayMs} ms), or the first retry exhausts the budget.`,
  "limits.isolationBudgetTooSmall": (params: {
    maxIsolationCallsPerBatch: number;
    required: number;
    maxDocumentsPerClaim: number;
  }) =>
    `maxIsolationCallsPerBatch (${params.maxIsolationCallsPerBatch}) cannot isolate one failing document among ${params.maxDocumentsPerClaim}; at least ${params.required} calls are required.`,
  "limits.inFlightBelowBulk": (params: { maxInFlightBytes: number; maxBulkBytes: number }) =>
    `maxInFlightBytes (${params.maxInFlightBytes}) must be at least maxBulkBytes (${params.maxBulkBytes}), or a document near the bulk limit can never be held.`,
  "limits.leaseTooShortForDrain": (params: { leaseDurationMs: number; required: number }) =>
    `leaseDurationMs (${params.leaseDurationMs} ms) is too short to send one bulk request between heartbeats before a lease ends; at least ${params.required} ms (requestTimeoutMs + heartbeatIntervalMs + 1) is required.`,

  "materialize.invalidInput": (params: { field: string }) =>
    `materialize received an invalid ${quoted(params.field)}.`,
  "materialize.documentFailed": (params: { reason: string }) =>
    `The document could not be materialized (${params.reason}).`,

  "tracer.invalidKnex":
    "traceProjectionConnections requires Knex instances that emit query events.",
  "tracer.invalidSnapshot": "The tracer needs a live Knex transaction as the snapshot.",

  "client.invalidOptions": (params: { path: string }) =>
    `Search client option ${quoted(params.path)} is invalid.`,
  "client.createFailed": "The OpenSearch client could not be created.",
  "client.foreignClient": "The search client was not created by createSearchClient.",
  "client.connectionFailed": "The connection to OpenSearch failed.",
  "client.requestTimeout": "The OpenSearch request did not finish within its time limit.",
  "client.responseError": (params: { status: number; type: string }) =>
    `OpenSearch rejected the request with status ${params.status} (${params.type}).`,
  "client.responseTooLarge": (params: { maxBytes: number }) =>
    `The OpenSearch response exceeds ${params.maxBytes} bytes.`,
  "client.invalidResponse": "OpenSearch returned a response that the package cannot read.",
  "client.requestFailed": "The OpenSearch request failed.",
  "client.closeFailed": "The owned OpenSearch client could not be closed.",
  "client.conflictingBody": "A request may carry either a JSON body or an NDJSON body, not both.",

  "worker.invalidOptions": (params: { path: string }) =>
    `Indexer option ${quoted(params.path)} is invalid.`,
  "worker.duplicateDefinition": (params: { key: string }) =>
    `The indexer received two definitions for ${quoted(params.key)} with the same fingerprint.`,
  "worker.invalidPrimary": "getPrimaryDatabase() did not return a Knex instance.",
  "worker.primaryIsTransaction":
    "getPrimaryDatabase() returned a transaction; the worker needs a pooled Knex instance because Knex ignores isolation and read-only options on a nested transaction.",
  "worker.unexpectedError": "The drain failed with an unexpected error.",
  "worker.statementTimeout": (params: { timeoutMs: number }) =>
    `A worker SQL statement did not finish within statementTimeoutMs (${params.timeoutMs} ms).`,

  "query.invalidOptions": (params: { path: string }) =>
    `Search query option ${quoted(params.path)} is invalid.`,
  "query.duplicateSigningKey": (params: { keyId: string }) =>
    `Cursor signing key ID ${quoted(params.keyId)} is used more than once.`,
  "query.timeoutExceedsSearchLifetime": (params: {
    timeoutMs: number;
    maxSearchLifetimeMs: number;
  }) =>
    `limits.timeoutMs (${params.timeoutMs} ms) exceeds limits.maxSearchLifetimeMs (${params.maxSearchLifetimeMs} ms).`,
  "query.invalidInput": (params: { path: string }) =>
    `Search input field ${quoted(params.path)} is invalid.`,
  "query.bodyNotObject": "The search body must be a JSON object.",
  "query.invalidBody": (params: { reason: string; path: string }) =>
    `The search body is not valid JSON: ${params.reason} at "${params.path}".`,
  "query.unsupportedBodyKey": (params: { key: string }) =>
    `Top-level search body key ${quoted(params.key)} is not allowed in managed search.`,
  "query.invalidBodyValue": (params: { key: string }) =>
    `Search body field ${quoted(params.key)} has an invalid value.`,
  "query.sourceFieldNotAllowed": (params: { field: string }) =>
    `Source field ${quoted(params.field)} is not allowed by the source policy.`,
  "query.paginateRequiresSort": "Pagination requires an explicit sort in the search body.",
  "query.searchAfterWithCursor": "search_after cannot be combined with a cursor.",
  "query.cursorsNotConfigured": "Cursors require cursor signing keys in the query options.",
  "query.cursorTooLarge": (params: { maxLength: number }) =>
    `The next cursor would exceed ${params.maxLength} characters.`,
  "query.logicalKeyNotInCatalog": (params: { logicalKey: string }) =>
    `Logical key ${quoted(params.logicalKey)} is not registered in the search catalog.`,
  "query.notReady": (params: { logicalKey: string }) =>
    `Logical key ${quoted(params.logicalKey)} has no read target yet.`,
  "query.rebuildRequired": (params: { logicalKey: string }) =>
    `Logical key ${quoted(params.logicalKey)} requires a rebuild before it can be searched.`,
  "query.unsupportedFingerprint": (params: { logicalKey: string; fingerprint: string }) =>
    `The read target of ${quoted(params.logicalKey)} has fingerprint ${params.fingerprint}, which this process does not support.`,
  "query.unsupportedHashVersion": (params: { logicalKey: string; hashVersion: string }) =>
    `The read target of ${quoted(params.logicalKey)} uses hash version ${quoted(params.hashVersion)}, which this package version does not support.`,
  "query.lifetimeExceedsCatalog": (params: {
    limit: string;
    configured: number;
    maximum: number;
  }) =>
    `The configured ${params.limit} (${params.configured} ms) exceeds the catalog maximum (${params.maximum} ms).`,
  "query.targetNotReadable": (params: { state: string }) =>
    `The read target is in state ${params.state} and cannot be searched.`,
  "query.invalidCatalogResult": "The search catalog returned a malformed result.",
  "query.catalogFailed": "The search catalog lookup failed.",
  "query.pitRequestRejected": "OpenSearch rejected the shape of a point-in-time request.",
  "query.targetIndexMissing": "The physical index of the read target does not exist.",

  "cursor.malformed": "The cursor is malformed.",
  "cursor.tooLarge": (params: { maxLength: number }) =>
    `The cursor exceeds ${params.maxLength} characters.`,
  "cursor.invalidSignature": "The cursor signature does not verify.",
  "cursor.invalidPayload": "The cursor payload is invalid.",
  "cursor.queryMismatch": "The cursor belongs to a different search body.",
  "cursor.expired": "The cursor has expired.",
  "cursor.targetMissing": "The target of the cursor no longer exists.",
  "cursor.targetNotReadable": (params: { state: string }) =>
    `The target of the cursor is in state ${params.state} and can no longer be read.`,
  "cursor.epochInvalidated": "The target of the cursor belongs to an invalidated capture epoch.",
  "cursor.logicalKeyMismatch": "The cursor belongs to a different logical key.",
  "cursor.fingerprintMismatch": "The fingerprint of the cursor's target has changed.",
  "cursor.pitClosed": "The point in time of the cursor is closed or expired.",

  "admin.invalidOptions": (params: { path: string }) =>
    `Search admin option ${quoted(params.path)} is invalid.`,
  "admin.invalidOperation": (params: { path: string }) =>
    `Administrative operation field ${quoted(params.path)} is invalid.`,
  "admin.primaryResolverFailed": "getPrimaryDatabase failed while resolving the primary database.",
  "admin.invalidPrimary": "getPrimaryDatabase must return a Knex instance.",
  "admin.primaryIsTransaction":
    "Administrative operations open their own transactions; getPrimaryDatabase must return a pooled Knex instance, not a transaction.",
  "admin.notRegistered": (params: { namespace: string; logicalKey: string }) =>
    `Logical key ${quoted(params.logicalKey)} has no index row in namespace ${quoted(params.namespace)}; record a target intent first.`,
  "admin.leaseBusy": (params: { logicalKey: string }) =>
    `Another administrative operation holds the lease of ${quoted(params.logicalKey)}; retry after it finishes or its lease expires.`,
  "admin.leaseLost": (params: { logicalKey: string }) =>
    `The administrative lease of ${quoted(params.logicalKey)} was replaced or expired; nothing was written.`,
  "admin.invalidRow": (params: { statement: string }) =>
    `Administrative statement ${params.statement} returned a row with an unexpected shape.`,
  "admin.invalidTargetIntent": (params: { field: string }) =>
    `Target intent field ${quoted(params.field)} is invalid.`,
  "admin.targetIntentRefused": (params: { reason: string; state: string }) =>
    `The target identity cannot be used (${params.reason}, state ${params.state}).`,
  "admin.duplicateDefinition": (params: { logicalKey: string }) =>
    `Two definitions of ${quoted(params.logicalKey)} have the same fingerprint.`,
  "admin.foreignHandle": "The search admin handle was not created by createSearchAdmin.",
  "admin.registrationRefused": (params: { reason: string; state: string }) =>
    `The target cannot be registered (${params.reason}, state ${params.state}).`,
  "admin.definitionNotRegistered": (params: { logicalKey: string }) =>
    `No definition of ${quoted(params.logicalKey)} with this fingerprint is registered on the admin handle.`,
  "admin.definitionAmbiguous": (params: { logicalKey: string; count: number }) =>
    `${params.count} definitions of ${quoted(params.logicalKey)} are registered; planCreate needs exactly one.`,
  "admin.invalidPlan": (params: { field: string }) =>
    `Create plan field ${quoted(params.field)} is invalid or does not match the registered definition.`,
  "admin.pluginsMissing": (params: { logicalKey: string; count: number }) =>
    `${params.count} required plugin(s) of ${quoted(params.logicalKey)} are not installed on every node; nothing was created.`,
  "admin.remoteCreateAmbiguous": (params: { targetId: string }) =>
    `The outcome of creating target ${params.targetId} is unknown; stop every creator and run reconcileCreate.`,
  "admin.remoteCreateRejected": (params: { targetId: string }) =>
    `OpenSearch rejected the index of target ${params.targetId}; the identity is abandoned and a new plan is required.`,
  "admin.remoteIndexConflict": (params: { targetId: string }) =>
    `An index with the name of target ${params.targetId} already exists and is not owned by it; it was left untouched.`,
  "admin.remoteCreateRefused": (params: { targetId: string; status: number }) =>
    `OpenSearch refused to create target ${params.targetId} (HTTP ${params.status}); the same plan may be retried.`,
  "admin.registeredTargetUnavailable": (params: { targetId: string; reason: string }) =>
    `Registered target ${params.targetId} is unavailable remotely (${params.reason}); it is never re-created, rebuild into a new target.`,
  "admin.quiescenceNotConfirmed": (params: { targetId: string }) =>
    `reconcileCreate for target ${params.targetId} requires confirmQuiescent: true.`,
  "admin.reconcileRefused": (params: { targetId: string; reason: string }) =>
    `Target ${params.targetId} cannot be reconciled (${params.reason}); nothing was changed.`,
  "admin.targetNotFound": (params: { targetId: string }) =>
    `Target ${params.targetId} does not exist in this namespace.`,
  "admin.invalidRemoteResponse": (params: { operation: string }) =>
    `OpenSearch returned an unexpected response to ${params.operation}.`,
  "admin.leaseTooShort": (params: { leaseMs: number; requiredMs: number }) =>
    `The administrative lease of ${params.leaseMs} ms cannot cover the remote calls and their result write; at least ${params.requiredMs} ms is required.`,
  "admin.invalidBuildArgument": (params: { path: string }) =>
    `Build argument ${quoted(params.path)} is invalid.`,
  "admin.buildNotFound": (params: { buildId: string }) =>
    `Build ${params.buildId} does not exist in this namespace.`,
  "admin.buildRefused": (params: { reason: string; state: string }) =>
    `The rebuild cannot start (${params.reason}, state ${params.state}); nothing was changed.`,
  "admin.backfillRefused": (params: { buildId: string; reason: string }) =>
    `The backfill step of build ${params.buildId} was refused (${params.reason}); nothing was written.`,
  "admin.scanFailed": (params: { logicalKey: string }) =>
    `The source scan of ${params.logicalKey} failed; nothing was written.`,
  "admin.invalidScanResult": (params: { logicalKey: string; field: string }) =>
    `The source scan of ${params.logicalKey} returned an invalid ${quoted(params.field)}; nothing was written.`,
  "admin.aborted": (params: { operation: string }) =>
    `The administrative step ${params.operation} was aborted before writing.`,
  "admin.cutoverBlocked": (params: { buildId: string; reason: string }) =>
    `Cutover of build ${params.buildId} is blocked (${params.reason}); the read pointer did not move.`,
  "admin.rollbackBlocked": (params: { buildId: string; reason: string }) =>
    `Rollback of build ${params.buildId} is blocked (${params.reason}); the read pointer did not move.`,
  "admin.verificationFailed": (params: { buildId: string; violations: number }) =>
    `Sample verification of build ${params.buildId} found ${params.violations} mismatching documents; the read pointer did not move.`,
  "admin.resumeRefused": (params: { logicalKey: string; reason: string }) =>
    `Capture of ${params.logicalKey} was not resumed (${params.reason}); nothing was changed.`,
  "admin.retirementRefused": (params: { targetId: string; reason: string }) =>
    `Retirement of target ${params.targetId} stopped (${params.reason}); completed steps are kept and the call can be repeated.`,
  "admin.invalidRepairArgument": (params: { path: string }) =>
    `Repair argument ${quoted(params.path)} is invalid.`,
  "admin.verificationRefused": (params: { targetId: string; reason: string }) =>
    `Verification of target ${params.targetId} did not run (${params.reason}); nothing was written.`,
  "admin.resumeTargetRefused": (params: { targetId: string; reason: string }) =>
    `Target ${params.targetId} was not resumed (${params.reason}); nothing was changed.`,
  "admin.lifetimeChangeRefused": (params: {
    logicalKey: string;
    field: string;
    recordedMs: number;
    requestedMs: number;
  }) =>
    `The recorded ${params.field} of ${params.logicalKey} cannot be lowered from ${params.recordedMs} ms to ${params.requestedMs} ms: cursors issued under the higher value may still be live and the retirement grace would shrink. Nothing was changed.`,
  "query.bodyTooLarge": (params: { maxBytes: number }) =>
    `The search body exceeds ${params.maxBytes} bytes.`,
  "admin.clientNotConfigured": (params: { operation: string }) =>
    `${params.operation} needs an OpenSearch client, but this administration handle was created without one; nothing was read or written.`,
  "indexMeta.invalidStoreId": "A store identifier in index _meta must be a lowercase UUID.",
  "binding.invalidRow": (params: { statement: string }) =>
    `Store binding statement ${params.statement} returned a row with an unexpected shape.`,
  "binding.originUnrecorded": (params: { storeId: string }) =>
    `Search store ${params.storeId} has no recorded origin database; remote effects are refused until confirmStoreOwnership or adoptCopiedStore runs. Capture continues.`,
  "binding.originChanged": (params: { storeId: string }) =>
    `Search store ${params.storeId} was recorded in a different database than the one connected now (copy or restore); remote effects are refused until adoptCopiedStore or confirmStoreOwnership runs. Capture continues.`,
  "binding.instanceMismatch": (params: { storeId: string }) =>
    `Search store ${params.storeId} is bound to a different instanceName than the one configured; remote effects are refused. Capture continues.`,
  "binding.remoteStoreMismatch": (params: {
    targetId: string;
    storeId: string;
    remoteStoreId: string;
  }) =>
    `The index of target ${params.targetId} belongs to search store ${params.remoteStoreId}, not ${params.storeId}; it was not touched.`,
  "admin.copyNotConfirmed": "adoptCopiedStore requires confirmCopy: true; nothing was changed.",
  "admin.ownershipNotConfirmed":
    "confirmStoreOwnership requires confirmSoleOwner: true; nothing was changed.",
  "admin.invalidOwnershipInput": (params: { path: string }) =>
    `Store ownership input ${quoted(params.path)} is invalid; nothing was changed.`,
  "admin.instanceNameConflict":
    "The instanceName argument differs from the instanceName configured on this synchronization; nothing was changed.",
  "admin.targetDetached": (params: { targetId: string }) =>
    `Target ${params.targetId} was detached by adoptCopiedStore; no operation acts on it.`,

  "catalog.invalidOptions": (params: { path: string }) =>
    `Catalog reader option ${quoted(params.path)} is invalid.`,
  "catalog.invalidArgument": (params: { path: string }) =>
    `Catalog lookup argument ${quoted(params.path)} is invalid.`,
  "catalog.primaryResolverFailed":
    "getPrimaryDatabase failed while resolving the primary database for a catalog lookup.",
  "catalog.invalidPrimary": "getPrimaryDatabase must return a Knex instance.",
  "catalog.primaryIsTransaction":
    "Catalog lookups never use an application transaction; getPrimaryDatabase must return a pooled Knex instance.",
  "catalog.timeout": (params: { timeoutMs: number }) =>
    `The catalog lookup did not finish within ${params.timeoutMs} ms.`,
  "catalog.aborted": "The catalog lookup was aborted.",
  "catalog.failed": "The catalog lookup failed.",
  "catalog.invalidRow": (params: { statement: string }) =>
    `Catalog statement ${params.statement} returned a row with an unexpected shape.`,

  "documentId.reserved": "The document ID is reserved by the package (target fence).",
  "limits.fenceIntervalBelowRequest": (params: {
    fenceRenewIntervalMs: number;
    requestTimeoutMs: number;
  }) =>
    `fenceRenewIntervalMs (${params.fenceRenewIntervalMs} ms) must be at least requestTimeoutMs (${params.requestTimeoutMs} ms) so that one fence advance can finish within one renewal interval.`,
  "fence.invalidRow": (params: { statement: string }) =>
    `Fence statement ${params.statement} returned a row with an unexpected shape.`,
  "fence.invalidInput": (params: { operation: string }) =>
    `Invalid input for fence operation ${params.operation}.`,
  "fence.lost": (params: {
    targetId: string;
    class: string;
    localEpoch: number;
    remoteEpoch: number;
  }) =>
    `Another database holds the fence of target ${params.targetId} (${params.class}: local epoch ${params.localEpoch}, remote epoch ${params.remoteEpoch}); this database sends nothing to it until confirmStoreOwnership (on the rightful owner) or adoptCopiedStore (on a copy) runs.`,
  "fence.unreadable": (params: { targetId: string }) =>
    `The fence of target ${params.targetId} could not be read; nothing was changed. Retry when OpenSearch responds.`,
  "fence.takeoverContended": (params: { targetId: string; attempts: number }) =>
    `The fence of target ${params.targetId} kept moving during ${params.attempts} takeover attempts; another database is still writing to it. Stop it first.`,
} as const;
