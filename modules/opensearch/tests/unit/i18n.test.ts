import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { SearchConfigurationError, SearchTimeout } from "../../src/errors";
import { searchMessagesEn } from "../../src/i18n/en";
import {
  DEFAULT_SEARCH_LOCALE,
  formatSearchMessage,
  getSearchLocale,
  registerSearchMessages,
  type SearchMessage,
  type SearchMessageKey,
  type SearchMessageParams,
  setSearchLocale,
} from "../../src/i18n/index";
import { searchMessagesKo } from "../../src/i18n/ko";
import { CLASS_BY_CODE } from "./error-classes";

const SOURCE_ROOT = fileURLToPath(new URL("../../src/", import.meta.url));
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const functionSchema = z.instanceof(Function);

// Sample parameters for every key; a new key makes this table fail to compile.
type SampleParams = { [K in SearchMessageKey]: SearchMessageParams<K> };
const SAMPLE_PARAMS: SampleParams = {
  "error.notConfigured": undefined,
  "error.unavailable": undefined,
  "error.timeout": undefined,
  "error.queryInvalid": undefined,
  "error.definitionMismatch": undefined,
  "error.rebuildRequired": undefined,
  "error.notReady": undefined,
  "error.stopping": undefined,
  "error.inTransaction": undefined,
  "error.catalogUnavailable": undefined,
  "error.cursorExpired": undefined,
  "error.configuration": undefined,
  "error.schemaMissing": undefined,
  "error.schemaVersionMismatch": undefined,
  "error.invalidTransaction": undefined,
  "error.storeMismatch": undefined,
  "error.noWriteTarget": undefined,
  "error.invalidDocumentId": undefined,
  "error.revisionOverflow": undefined,
  "error.revisionDivergence": undefined,
  "error.projection": undefined,
  "error.targetUnavailable": undefined,
  "error.adminBusy": undefined,
  "error.adminLeaseLost": undefined,
  "error.adminPreconditionFailed": undefined,
  "names.invalidSchema": { name: "Bad" },
  "names.reservedSchema": { name: "public" },
  "names.invalidNamespace": { name: "Bad" },
  "names.invalidLogicalKey": { name: "Bad" },
  "names.invalidTargetId": { name: "x" },
  "names.indexNameTooLong": { kind: "writeAlias", bytes: 300, maxBytes: 255 },
  "names.invalidPhysicalIndex": { name: "x" },
  "names.invalidWriteAlias": { name: "x" },
  "documentId.empty": undefined,
  "documentId.nul": undefined,
  "documentId.illFormed": undefined,
  "documentId.tooLong": { bytes: 600, maxBytes: 512 },
  "canonicalJson.invalidValue": { reason: "bigint", path: "/a" },
  "projection.invalidResult": undefined,
  "projection.documentNotObject": undefined,
  "projection.invalidDocument": { reason: "bigint", path: "/document/a" },
  "projection.reservedField": { field: "_id" },
  "revision.overflow": undefined,
  "revision.invalid": undefined,
  "definition.notObject": undefined,
  "definition.unknownKey": { key: "mapping" },
  "definition.invalidLogicalKey": undefined,
  "definition.invalidProjectionVersion": { maxLength: 256 },
  "definition.invalidSchema": undefined,
  "definition.missingFunction": { field: "materialize" },
  "definition.settingsNotObject": undefined,
  "definition.invalidPart": { field: "settings", reason: "bigint", path: "/index" },
  "definition.invalidRequiredPlugins": { maxLength: 256 },
  "definition.duplicateRequiredPlugin": undefined,
  "definition.unsupportedHashVersion": { supported: "sonamu-c14n-v1" },
  "mappings.notObject": undefined,
  "mappings.unsupportedKey": { key: "_source" },
  "mappings.propertiesNotObject": undefined,
  "mappings.reservedProperty": { property: "_id" },
  "mappings.invalidDynamic": undefined,
  "indexMeta.invalidFingerprint": undefined,
  "i18n.invalidLocale": { locale: "x" },
  "i18n.unknownMessageKey": { key: "x" },
  "i18n.invalidMessage": { key: "x" },
  "sql.invalidIdentifier": { name: "Bad" },
  "sql.invalidFragment": undefined,
  "sql.invalidPlaceholders": { placeholders: 2, values: 1 },
  "sql.invalidTimeout": { setting: "lockTimeoutMs" },
  "schema.invalidOptions": undefined,
  "schema.notInstalled": { schema: "sonamu_search" },
  "schema.ahead": { installed: 2, supported: 1 },
  "schema.behind": { installed: 1, required: 2 },
  "schema.checksumMismatch": { version: 1 },
  "schema.versionGap": { version: 1 },
  "schema.invalidRow": { table: "store" },
  "schema.isolationNotReadCommitted": { isolation: "repeatable read" },
  "grants.noRoles": undefined,
  "grants.duplicateRole": { role: "app_worker" },
  "grants.reservedRole": { role: "public" },
  "pg.transactionConflict": { sqlstate: "40001" },
  "pg.lockTimeout": { sqlstate: "55P03" },
  "pg.schemaMissing": { sqlstate: "42P01" },
  "pg.insufficientPrivilege": { sqlstate: "42501" },
  "pg.readOnlyTransaction": undefined,
  "pg.failedTransaction": undefined,
  "pg.checkViolation": { constraint: "targets_check" },
  "pg.revisionOutOfRange": { constraint: "documents_revision_safe_integer" },
  "pg.duplicateObject": { sqlstate: "42P07" },
  "pg.undefinedObject": { sqlstate: "42704" },
  "pg.unavailable": { sqlstate: "08006" },
  "pg.driverError": undefined,
  "pg.statementFailed": { sqlstate: "XX000" },
  "sync.invalidOptions": { path: "maxIdsPerCall" },
  "sync.invalidPrimary": undefined,
  "sync.primaryResolverFailed": undefined,
  "sync.initializeAborted": undefined,
  "sync.initializeStoreMismatch": {
    expected: "00000000-0000-4000-8000-000000000001",
    actual: "00000000-0000-4000-8000-000000000002",
  },
  "sync.notTransaction": undefined,
  "sync.completedTransaction": undefined,
  "sync.storeIdentityUninitialized": undefined,
  "sync.invalidMarkInput": { field: "ids" },
  "sync.tooManyIds": { count: 10_001, max: 10_000 },
  "sync.logicalKeyNotRegistered": { namespace: "app", logicalKey: "chat-messages" },
  "sync.storeMismatch": {
    expected: "00000000-0000-4000-8000-000000000001",
    actual: "00000000-0000-4000-8000-000000000002",
  },
  "sync.noWriteTarget": { namespace: "app", logicalKey: "chat-messages" },
  "sync.invalidRow": { statement: "markChanged" },
  "delivery.invalidInput": { operation: "claim", field: "leaseMs" },
  "delivery.invalidRow": { statement: "claimDeliveries" },
  "heartbeat.invalidInput": { field: "capabilities.0" },
  "bulk.invalidLimit": { name: "maxBulkBytes" },
  "sonamu.notInitialized": undefined,
  "sonamu.primaryIsTransaction": undefined,
  "sonamu.noActiveTransaction": undefined,
  "sonamu.notTransactionWrapper": undefined,
  "sonamu.invalidSynchronization": undefined,
  "sonamu.projectionScopeNotTransaction": undefined,
  "lifecycle.invalidOptions": { path: "worker.pollIntervalMs" },
  "snapshot.invalidPrimary": undefined,
  "snapshot.primaryIsTransaction": undefined,
  "snapshot.invalidTimeouts": { field: "statementTimeoutMs" },
  "snapshot.notRepeatableRead": { isolation: "read committed" },
  "snapshot.notReadOnly": undefined,
  "snapshot.onReplica": undefined,
  "snapshot.invalidRow": { statement: "openSnapshot" },
  "limits.unknownField": { field: "maxDocuments" },
  "limits.invalidValue": { field: "leaseDurationMs" },
  "limits.heartbeatTooLong": { heartbeatIntervalMs: 20_000, leaseDurationMs: 30_000 },
  "limits.timeoutExceedsLease": {
    field: "projectionTimeoutMs",
    timeoutMs: 60_000,
    leaseDurationMs: 30_000,
  },
  "limits.retryDelayInverted": { retryBaseDelayMs: 5_000, retryMaxDelayMs: 1_000 },
  "limits.retryAgeTooSmall": { maxRetryAgeMs: 500, retryBaseDelayMs: 1_000 },
  "limits.isolationBudgetTooSmall": {
    maxIsolationCallsPerBatch: 3,
    required: 15,
    maxDocumentsPerClaim: 100,
  },
  "limits.inFlightBelowBulk": { maxInFlightBytes: 1_024, maxBulkBytes: 5_242_880 },
  "limits.leaseTooShortForDrain": { leaseDurationMs: 30_000, required: 100_000 },
  "materialize.invalidInput": { field: "deliveries" },
  "materialize.documentFailed": { reason: "schema_invalid" },
  "tracer.invalidKnex": undefined,
  "tracer.invalidSnapshot": undefined,
  "client.invalidOptions": { path: "requestTimeoutMs" },
  "client.createFailed": undefined,
  "client.foreignClient": undefined,
  "client.connectionFailed": undefined,
  "client.requestTimeout": undefined,
  "client.responseError": { status: 400, type: "parsing_exception" },
  "client.responseTooLarge": { maxBytes: 1024 },
  "client.invalidResponse": undefined,
  "client.requestFailed": undefined,
  "client.closeFailed": undefined,
  "client.conflictingBody": undefined,
  "worker.invalidOptions": { path: "limits" },
  "worker.duplicateDefinition": { key: "chat-messages" },
  "worker.invalidPrimary": undefined,
  "worker.primaryIsTransaction": undefined,
  "worker.unexpectedError": undefined,
  "worker.statementTimeout": { timeoutMs: 5_000 },
  "query.invalidOptions": { path: "limits.maxPageSize" },
  "query.duplicateSigningKey": { keyId: "k1" },
  "query.timeoutExceedsSearchLifetime": { timeoutMs: 10, maxSearchLifetimeMs: 5 },
  "query.invalidInput": { path: "timeoutMs" },
  "query.bodyNotObject": undefined,
  "query.invalidBody": { reason: "bigint", path: "/query" },
  "query.unsupportedBodyKey": { key: "aggs" },
  "query.invalidBodyValue": { key: "size" },
  "query.sourceFieldNotAllowed": { field: "secret" },
  "query.paginateRequiresSort": undefined,
  "query.searchAfterWithCursor": undefined,
  "query.cursorsNotConfigured": undefined,
  "query.cursorTooLarge": { maxLength: 8192 },
  "query.logicalKeyNotInCatalog": { logicalKey: "chat-messages" },
  "query.notReady": { logicalKey: "chat-messages" },
  "query.rebuildRequired": { logicalKey: "chat-messages" },
  "query.unsupportedFingerprint": { logicalKey: "chat-messages", fingerprint: "ab" },
  "query.unsupportedHashVersion": { logicalKey: "chat-messages", hashVersion: "sonamu-c14n-v2" },
  "query.lifetimeExceedsCatalog": { limit: "maxCursorLifetimeMs", configured: 2, maximum: 1 },
  "query.targetNotReadable": { state: "retired" },
  "query.invalidCatalogResult": undefined,
  "query.catalogFailed": undefined,
  "query.pitRequestRejected": undefined,
  "query.targetIndexMissing": undefined,
  "cursor.malformed": undefined,
  "cursor.tooLarge": { maxLength: 8192 },
  "cursor.invalidSignature": undefined,
  "cursor.invalidPayload": undefined,
  "cursor.queryMismatch": undefined,
  "cursor.expired": undefined,
  "cursor.targetMissing": undefined,
  "cursor.targetNotReadable": { state: "retiring" },
  "cursor.epochInvalidated": undefined,
  "cursor.logicalKeyMismatch": undefined,
  "cursor.fingerprintMismatch": undefined,
  "cursor.pitClosed": undefined,
  "admin.invalidOptions": { path: "timeouts" },
  "admin.invalidOperation": { path: "kind" },
  "admin.primaryResolverFailed": undefined,
  "admin.invalidPrimary": undefined,
  "admin.primaryIsTransaction": undefined,
  "admin.notRegistered": { namespace: "app", logicalKey: "chat-messages" },
  "admin.leaseBusy": { logicalKey: "chat-messages" },
  "admin.leaseLost": { logicalKey: "chat-messages" },
  "admin.invalidRow": { statement: "acquireLease" },
  "admin.invalidTargetIntent": { field: "physicalIndex" },
  "admin.targetIntentRefused": { reason: "target-identity-terminal", state: "retired" },
  "admin.duplicateDefinition": { logicalKey: "chat-messages" },
  "admin.foreignHandle": undefined,
  "admin.registrationRefused": { reason: "capture-suspended", state: "suspended" },
  "admin.definitionNotRegistered": { logicalKey: "chat-messages" },
  "admin.definitionAmbiguous": { logicalKey: "chat-messages", count: 2 },
  "admin.invalidPlan": { field: "body" },
  "admin.pluginsMissing": { logicalKey: "chat-messages", count: 1 },
  "admin.remoteCreateAmbiguous": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "admin.remoteCreateRejected": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "admin.remoteIndexConflict": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "admin.remoteCreateRefused": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", status: 429 },
  "admin.registeredTargetUnavailable": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "registered-target-missing-remote",
  },
  "admin.quiescenceNotConfirmed": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "admin.reconcileRefused": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "remote-create-not-unresolved",
  },
  "admin.targetNotFound": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "admin.invalidRemoteResponse": { operation: "get-mapping" },
  "admin.leaseTooShort": { leaseMs: 1_500, requiredMs: 23_000 },
  "admin.invalidBuildArgument": { path: "buildId" },
  "admin.buildNotFound": { buildId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "admin.buildRefused": { reason: "open-build-exists", state: "backfilling" },
  "admin.backfillRefused": {
    buildId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "scan-cursor-cas-failed",
  },
  "admin.scanFailed": { logicalKey: "chat-messages" },
  "admin.invalidScanResult": { logicalKey: "chat-messages", field: "next" },
  "admin.aborted": { operation: "backfill-page" },
  "admin.cutoverBlocked": {
    buildId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "pending-above-limit",
  },
  "admin.rollbackBlocked": {
    buildId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "read-head-moved",
  },
  "admin.verificationFailed": { buildId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", violations: 2 },
  "admin.resumeRefused": { logicalKey: "chat-messages", reason: "capture-not-suspended" },
  "admin.retirementRefused": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "retirement-grace-pending",
  },
  "admin.invalidRepairArgument": { path: "limit" },
  "admin.verificationRefused": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "verification-not-quiesced",
  },
  "admin.resumeTargetRefused": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    reason: "verification-incomplete",
  },
  "admin.lifetimeChangeRefused": {
    logicalKey: "messages",
    field: "maxCursorLifetimeMs",
    recordedMs: 600_000,
    requestedMs: 60_000,
  },
  "query.bodyTooLarge": { maxBytes: 1_048_576 },
  "admin.clientNotConfigured": { operation: "cutover" },
  "indexMeta.invalidStoreId": undefined,
  "binding.invalidRow": { statement: "readStoreBinding" },
  "binding.originUnrecorded": { storeId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "binding.originChanged": { storeId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "binding.instanceMismatch": { storeId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "binding.remoteStoreMismatch": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    storeId: "1c0a9d2f-2d3e-4f60-9b0c-1d2e3f4a5b6c",
    remoteStoreId: "2d1b0e3a-3e4f-4a71-8c1d-2e3f4a5b6c7d",
  },
  "admin.copyNotConfirmed": undefined,
  "admin.ownershipNotConfirmed": undefined,
  "admin.invalidOwnershipInput": { path: "instanceName" },
  "admin.instanceNameConflict": undefined,
  "admin.targetDetached": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "catalog.invalidOptions": { path: "namespace" },
  "catalog.invalidArgument": { path: "timeoutMs" },
  "catalog.primaryResolverFailed": undefined,
  "catalog.invalidPrimary": undefined,
  "catalog.primaryIsTransaction": undefined,
  "catalog.timeout": { timeoutMs: 250 },
  "catalog.aborted": undefined,
  "catalog.failed": undefined,
  "catalog.invalidRow": { statement: "resolveReadHeads" },
  "documentId.reserved": undefined,
  "limits.fenceIntervalBelowRequest": { fenceRenewIntervalMs: 5_000, requestTimeoutMs: 30_000 },
  "fence.invalidRow": { statement: "readFence" },
  "fence.invalidInput": { operation: "read" },
  "fence.lost": {
    targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    class: "behind",
    localEpoch: 3,
    remoteEpoch: 4,
  },
  "fence.unreadable": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" },
  "fence.takeoverContended": { targetId: "0b9f8c1e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", attempts: 3 },
};

function sampleMessage(key: SearchMessageKey): SearchMessage {
  // SAFETY: SAMPLE_PARAMS is typed per key, so key and params match.
  return { key, params: SAMPLE_PARAMS[key] } as SearchMessage;
}

function captureConfigurationError(run: () => void): SearchConfigurationError {
  try {
    run();
  } catch (error) {
    if (error instanceof SearchConfigurationError) return error;
    throw error;
  }
  throw new Error("nothing was thrown");
}

afterEach(() => {
  setSearchLocale(DEFAULT_SEARCH_LOCALE);
});

describe("카탈로그 일치", () => {
  it("en과 ko는 키가 같고, 같은 키의 항목 종류(문자열/함수)가 같다", () => {
    const englishKeys = Object.keys(searchMessagesEn).toSorted();
    expect(Object.keys(searchMessagesKo).toSorted()).toEqual(englishKeys);
    expect(Object.keys(SAMPLE_PARAMS).toSorted()).toEqual(englishKeys);
    for (const key of Object.keys(searchMessagesEn)) {
      const english = functionSchema.safeParse(Object(searchMessagesEn)[key]).success;
      const korean = functionSchema.safeParse(Object(searchMessagesKo)[key]).success;
      expect([key, korean]).toEqual([key, english]);
    }
  });

  it("모든 키가 두 언어로 비어 있지 않게 렌더링되고, 영어에는 한글이 없고 한국어에는 한글이 있다", () => {
    for (const key of Object.keys(SAMPLE_PARAMS)) {
      const parsedKey = z.enum(Object.keys(searchMessagesEn)).parse(key);
      // SAFETY: z.enum confirmed an en catalogue key.
      const message = sampleMessage(parsedKey as SearchMessageKey);
      const english = formatSearchMessage(message, "en");
      const korean = formatSearchMessage(message, "ko");
      expect(english.length, key).toBeGreaterThan(0);
      expect(english, key).not.toMatch(HANGUL);
      expect(english, key).not.toContain("undefined");
      expect(korean, key).toMatch(HANGUL);
      expect(korean, key).not.toContain("undefined");
    }
  });
});

describe("오류 클래스 렌더링", () => {
  it("모든 오류 클래스는 기본 메시지를 영어로 렌더링하고 localize로 한국어를 준다", () => {
    for (const ErrorClass of Object.values(CLASS_BY_CODE)) {
      const error = new ErrorClass();
      expect(error.message).toBe(formatSearchMessage(sampleMessage(error.messageKey), "en"));
      expect(error.message).not.toMatch(HANGUL);
      expect(error.localize("ko")).toMatch(HANGUL);
      expect(error.localize("en")).toBe(error.message);
    }
  });

  it("message는 생성 시점의 locale로 고정되고 localize는 지정한 locale을 쓴다", () => {
    setSearchLocale("ko");
    const korean = new SearchTimeout();
    setSearchLocale("en");
    const english = new SearchTimeout();
    expect(korean.message).toMatch(HANGUL);
    expect(english.message).not.toMatch(HANGUL);
    expect(korean.localize("en")).toBe(english.message);
    expect(english.localize("ko")).toBe(korean.message);
  });
});

describe("locale 설정", () => {
  it("기본 locale은 en이고 setSearchLocale로 바꾼다", () => {
    expect(getSearchLocale()).toBe("en");
    setSearchLocale("ko-KR");
    expect(getSearchLocale()).toBe("ko-KR");
    expect(new SearchTimeout().message).toBe(formatSearchMessage({ key: "error.timeout" }, "ko"));
  });

  it("지역 태그는 언어로, 모르는 언어는 영어로 대체한다", () => {
    const english = formatSearchMessage({ key: "error.timeout" }, "en");
    const korean = formatSearchMessage({ key: "error.timeout" }, "ko");
    expect(formatSearchMessage({ key: "error.timeout" }, "KO-kr")).toBe(korean);
    expect(formatSearchMessage({ key: "error.timeout" }, "ja")).toBe(english);
    // Rendering runs while errors are constructed, so it must not throw on a malformed locale.
    expect(formatSearchMessage({ key: "error.timeout" }, "not a locale")).toBe(english);
  });

  it.each(["", "ko_KR", "../../etc"])("형식이 잘못된 locale %j는 거부한다", (locale) => {
    const error = captureConfigurationError(() => setSearchLocale(locale));
    expect(error.messageKey).toBe("i18n.invalidLocale");
    expect(getSearchLocale()).toBe("en");
  });
});

describe("카탈로그 등록", () => {
  it("일부 키만 등록하면 나머지는 영어로 대체되고, 지역 태그는 등록한 언어를 쓴다", () => {
    registerSearchMessages("fr", {
      "error.timeout": "Délai dépassé.",
      "names.invalidNamespace": (params) => `Espace de noms ${params.name} invalide.`,
    });
    expect(formatSearchMessage({ key: "error.timeout" }, "fr")).toBe("Délai dépassé.");
    expect(formatSearchMessage({ key: "error.timeout" }, "fr-CA")).toBe("Délai dépassé.");
    expect(
      formatSearchMessage({ key: "names.invalidNamespace", params: { name: "X" } }, "fr"),
    ).toBe("Espace de noms X invalide.");
    expect(formatSearchMessage({ key: "error.notReady" }, "fr")).toBe(
      formatSearchMessage({ key: "error.notReady" }, "en"),
    );
    setSearchLocale("fr");
    expect(new SearchTimeout().message).toBe("Délai dépassé.");
  });

  it("내장 언어에 등록하면 그 키만 덮어쓰고, 다시 등록하면 키 단위로 합친다", () => {
    registerSearchMessages("ko", { "error.notReady": "준비 안 됨" });
    registerSearchMessages("ko", { "error.stopping": "멈추는 중" });
    expect(formatSearchMessage({ key: "error.notReady" }, "ko")).toBe("준비 안 됨");
    expect(formatSearchMessage({ key: "error.stopping" }, "ko")).toBe("멈추는 중");
    expect(formatSearchMessage({ key: "error.timeout" }, "ko")).toBe(
      searchMessagesKo["error.timeout"],
    );
  });

  it("등록한 함수가 실패하거나 문자열이 아닌 값을 돌려주면 다음 후보로 렌더링한다", () => {
    registerSearchMessages("de", {
      "names.invalidNamespace": () => {
        throw new Error("boom");
      },
    });
    const message: SearchMessage = { key: "names.invalidNamespace", params: { name: "X" } };
    expect(formatSearchMessage(message, "de")).toBe(formatSearchMessage(message, "en"));
  });

  it("없는 키, 문자열/함수가 아닌 항목, 잘못된 locale은 거부한다", () => {
    const unknownKey = Object.fromEntries([["error.nope", "x"]]);
    expect(
      captureConfigurationError(() => registerSearchMessages("fr", unknownKey)).messageKey,
    ).toBe("i18n.unknownMessageKey");
    const notString = Object.fromEntries([["error.timeout", 1]]);
    const invalid = captureConfigurationError(() => registerSearchMessages("fr", notString));
    expect(invalid.messageKey).toBe("i18n.invalidMessage");
    expect(invalid.messageParams).toEqual({ key: "error.timeout" });
    expect(captureConfigurationError(() => registerSearchMessages("fr!", {})).messageKey).toBe(
      "i18n.invalidLocale",
    );
  });
});

// Strips comments, leaving // and /* inside strings, templates (with nested ${}) and regex literals intact.
// A regex literal is recognised by the usual previous-significant-character heuristic.
function stripComments(source: string): string {
  let output = "";
  let index = 0;
  let previous = "";
  const stack: ("template" | "brace")[] = [];
  const regexAllowedAfter = new Set([
    "",
    "(",
    ",",
    "=",
    ":",
    "[",
    "!",
    "&",
    "|",
    "?",
    "{",
    "}",
    ";",
    "+",
    "-",
    "*",
    "%",
    "<",
    ">",
    "~",
    "^",
  ]);
  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";
    if (stack.at(-1) === "template") {
      if (char === "\\") {
        output += char + next;
        index += 2;
      } else if (char === "`") {
        stack.pop();
        output += char;
        index += 1;
        previous = char;
      } else if (char === "$" && next === "{") {
        stack.push("brace");
        output += "${";
        index += 2;
        previous = "{";
      } else {
        output += char;
        index += 1;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      output += " ";
      continue;
    }
    if (char === "'" || char === '"') {
      const start = index;
      index += 1;
      while (index < source.length && source[index] !== char)
        index += source[index] === "\\" ? 2 : 1;
      index += 1;
      output += source.slice(start, index);
      previous = char;
      continue;
    }
    if (char === "`") {
      stack.push("template");
      output += char;
      index += 1;
      continue;
    }
    if (char === "/" && regexAllowedAfter.has(previous)) {
      const start = index;
      index += 1;
      let inClass = false;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") index += 1;
        else if (current === "[") inClass = true;
        else if (current === "]") inClass = false;
        else if (current === "/" && !inClass) break;
        index += 1;
      }
      index += 1;
      output += source.slice(start, index);
      previous = "/";
      continue;
    }
    if (char === "{" && stack.length > 0) stack.push("brace");
    if (char === "}" && stack.at(-1) === "brace") stack.pop();
    output += char;
    if (char.trim() !== "") previous = char;
    index += 1;
  }
  return output;
}

describe("src 리터럴 언어", () => {
  it("src/i18n/ko.ts 밖의 src 코드(주석 제외)에는 한글이 없다", () => {
    const files = readdirSync(SOURCE_ROOT, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .map((file) => file.split(path.sep).join("/"));
    expect(files).toContain("i18n/ko.ts");
    expect(files.length).toBeGreaterThanOrEqual(10);
    const violations = files
      .filter((file) => file !== "i18n/ko.ts")
      .filter((file) =>
        HANGUL.test(stripComments(readFileSync(path.join(SOURCE_ROOT, file), "utf8"))),
      );
    expect(violations).toEqual([]);
    // Positive control: ko.ts has Hangul outside comments.
    expect(stripComments(readFileSync(path.join(SOURCE_ROOT, "i18n/ko.ts"), "utf8"))).toMatch(
      HANGUL,
    );
  });
});
