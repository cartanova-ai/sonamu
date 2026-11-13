import { type SearchMessageCatalog } from "./index";

function quoted(value: string): string {
  return JSON.stringify(value);
}

export const searchMessagesKo: SearchMessageCatalog = {
  "error.notConfigured": "이 대상에는 검색이 설정되어 있지 않습니다.",
  "error.unavailable": "OpenSearch를 사용할 수 없습니다.",
  "error.timeout": "작업이 제한 시간 안에 끝나지 않았습니다.",
  "error.queryInvalid": "허용되지 않는 검색 요청입니다.",
  "error.definitionMismatch": "이 프로세스는 읽기 대상의 fingerprint를 지원하지 않습니다.",
  "error.rebuildRequired": "캡처가 중단되어 새 대상을 만들고 cutover해야 합니다.",
  "error.notReady": "아직 읽기 대상이 없습니다.",
  "error.stopping": "핸들이 멈추는 중이라 새 작업을 받지 않습니다.",
  "error.inTransaction": "활성 애플리케이션 트랜잭션 안에서는 관리형 검색을 실행할 수 없습니다.",
  "error.catalogUnavailable": "PostgreSQL 검색 카탈로그를 읽지 못했습니다.",
  "error.cursorExpired": "커서가 만료됐거나 검색과 맞지 않습니다.",
  "error.configuration": "설정이 올바르지 않습니다.",
  "error.schemaMissing": "검색 스키마나 그 테이블이 없습니다.",
  "error.schemaVersionMismatch": "설치된 검색 스키마의 버전이나 체크섬이 다릅니다.",
  "error.invalidTransaction": "진행 중인 트랜잭션이 필요합니다.",
  "error.storeMismatch": "트랜잭션이 다른 검색 store에 속합니다.",
  "error.noWriteTarget": "캡처가 active인데 등록된 쓰기 대상이 없습니다.",
  "error.invalidDocumentId": "문서 ID가 올바르지 않습니다.",
  "error.revisionOverflow": "리비전이 Number.MAX_SAFE_INTEGER를 넘으려 합니다.",
  "error.revisionDivergence": "색인된 버전이 리비전 원장과 어긋납니다.",
  "error.projection": "projection이 실패했습니다.",
  "error.targetUnavailable": "대상 인덱스나 쓰기 alias를 사용할 수 없습니다.",
  "error.adminBusy": "다른 관리 작업이 임대를 쥐고 있습니다.",
  "error.adminLeaseLost": "관리 임대를 잃었습니다.",
  "error.adminPreconditionFailed": "관리 작업의 전제 조건이 맞지 않습니다.",

  "names.invalidSchema": (params) =>
    `스키마 이름 ${quoted(params.name)}은 ^[a-z_][a-z0-9_]{0,62}$ 형식이어야 합니다.`,
  "names.reservedSchema": (params) =>
    `스키마 이름 ${quoted(params.name)}은 예약된 스키마라 패키지 전용 스키마로 쓸 수 없습니다.`,
  "names.invalidNamespace": (params) =>
    `namespace ${quoted(params.name)}는 ^[a-z0-9][a-z0-9-]{0,62}$ 형식이어야 합니다.`,
  "names.invalidLogicalKey": (params) =>
    `logical key ${quoted(params.name)}는 ^[a-z0-9][a-z0-9-]{0,62}$ 형식이어야 합니다.`,
  "names.invalidTargetId": (params) =>
    `대상 ID ${quoted(params.name)}는 소문자 표준 UUID여야 합니다.`,
  "names.indexNameTooLong": (params) =>
    `${params.kind === "writeAlias" ? "쓰기 alias" : "물리 인덱스"} 이름이 ${params.maxBytes}바이트를 넘습니다 (${params.bytes}바이트).`,
  "names.invalidPhysicalIndex": (params) =>
    `물리 인덱스 이름 ${quoted(params.name)}가 snm-<namespace>-<logical key>-<uuid> 형식이 아닙니다.`,
  "names.invalidWriteAlias": (params) =>
    `쓰기 alias 이름 ${quoted(params.name)}가 <물리 인덱스>-w 형식이 아닙니다.`,
  "documentId.empty": "문서 ID가 비어 있습니다.",
  "documentId.nul": "문서 ID에 NUL 문자가 들어 있습니다.",
  "documentId.illFormed": "문서 ID에 짝이 맞지 않는 UTF-16 서로게이트가 들어 있습니다.",
  "documentId.tooLong": (params) =>
    `문서 ID가 UTF-8 ${params.maxBytes}바이트를 넘습니다 (${params.bytes}바이트).`,

  "canonicalJson.invalidValue": (params) =>
    `정규 JSON으로 바꿀 수 없는 값입니다: ${params.reason} (경로 "${params.path}").`,
  "projection.invalidResult":
    'projection 결과는 { state: "present", document } 또는 { state: "deleted" }여야 합니다.',
  "projection.documentNotObject": "present projection의 document는 JSON 객체여야 합니다.",
  "projection.invalidDocument": (params) =>
    `projection 문서를 정규 JSON으로 바꿀 수 없습니다: ${params.reason} (경로 "${params.path}").`,
  "projection.reservedField": (params) =>
    `문서 최상위 필드 ${quoted(params.field)}는 예약되어 있습니다 (sonamu_meta, _로 시작하는 이름).`,
  "revision.overflow": "리비전이 Number.MAX_SAFE_INTEGER를 넘습니다.",
  "revision.invalid": "리비전은 1 이상의 안전한 정수여야 합니다.",

  "definition.notObject": "검색 정의는 객체여야 합니다.",
  "definition.unknownKey": (params) =>
    `검색 정의에 알 수 없는 키 ${quoted(params.key)}가 있습니다.`,
  "definition.invalidLogicalKey": "검색 정의의 logical key는 문자열이어야 합니다.",
  "definition.invalidProjectionVersion": (params) =>
    `projectionVersion은 앞뒤 공백과 제어 문자가 없는 1~${params.maxLength}자 문자열이어야 합니다.`,
  "definition.invalidSchema": "schema는 Standard Schema v1 구현이어야 합니다.",
  "definition.missingFunction": (params) => `검색 정의의 ${params.field}는 함수여야 합니다.`,
  "definition.settingsNotObject": "settings는 JSON 객체여야 합니다.",
  "definition.invalidPart": (params) =>
    `${params.field}를 정규 JSON으로 바꿀 수 없습니다: ${params.reason} (경로 "${params.path}").`,
  "definition.invalidRequiredPlugins": (params) =>
    `requiredPlugins의 각 항목은 앞뒤 공백과 제어 문자가 없는 1~${params.maxLength}자 문자열이어야 합니다.`,
  "definition.duplicateRequiredPlugin": "requiredPlugins에 중복된 이름이 있습니다.",
  "definition.unsupportedHashVersion": (params) =>
    `이 패키지가 지원하는 hash version은 ${params.supported}뿐입니다.`,
  "mappings.notObject": "mappings는 { properties, dynamic? } 객체여야 합니다.",
  "mappings.unsupportedKey": (params) =>
    `매핑 최상위 키 ${quoted(params.key)}는 지원하지 않습니다. 애플리케이션 매핑은 doc 아래에 놓이므로 properties와 dynamic만 받습니다.`,
  "mappings.propertiesNotObject": "mappings.properties는 객체여야 합니다.",
  "mappings.reservedProperty": (params) =>
    `매핑 속성 ${quoted(params.property)}는 예약된 이름이라 쓸 수 없습니다 (sonamu_meta, _로 시작하는 이름).`,
  "mappings.invalidDynamic": "mappings.dynamic 값이 OpenSearch dynamic 설정이 아닙니다.",
  "indexMeta.invalidFingerprint": "fingerprint는 소문자 SHA-256 hex여야 합니다.",

  "i18n.invalidLocale": (params) =>
    `locale ${quoted(params.locale)}는 BCP 47 언어 태그가 아닙니다.`,
  "i18n.unknownMessageKey": (params) => `메시지 키 ${quoted(params.key)}는 없습니다.`,
  "i18n.invalidMessage": (params) =>
    `메시지 ${quoted(params.key)}는 문자열이거나 문자열을 돌려주는 함수여야 합니다.`,

  "sql.invalidIdentifier": (params) =>
    `SQL 식별자 ${quoted(params.name)}는 ^[a-z_][a-z0-9_]{0,62}$ 형식이어야 합니다.`,
  "sql.invalidFragment":
    "패키지 SQL에는 검증된 SQL 조각만 끼워 넣을 수 있고, 값은 바인드 매개변수로 넘겨야 합니다.",
  "sql.invalidPlaceholders": (params) =>
    `문장이 서로 다른 자리표시자 ${params.placeholders}개를 쓰지만 값은 ${params.values}개입니다.`,
  "sql.invalidTimeout": (params) =>
    `시간 제한 ${params.setting}은 1 이상의 정수 밀리초여야 합니다.`,

  "schema.invalidOptions": "스키마 옵션이 올바르지 않습니다.",
  "schema.notInstalled": (params) =>
    `검색 스키마 ${quoted(params.schema)}가 설치되어 있지 않습니다. 먼저 마이그레이션에서 installSearchSchema를 실행하세요.`,
  "schema.ahead": (params) =>
    `설치된 검색 스키마 버전 ${params.installed}이 이 패키지가 지원하는 버전 ${params.supported}보다 높습니다. 낮은 버전으로 되돌릴 수 없습니다.`,
  "schema.behind": (params) =>
    `설치된 검색 스키마 버전 ${params.installed}이 필요한 버전 ${params.required}보다 낮습니다. installSearchSchema를 실행하세요.`,
  "schema.checksumMismatch": (params) =>
    `설치된 검색 스키마 버전 ${params.version}의 체크섬이 이 패키지와 다릅니다.`,
  "schema.versionGap": (params) =>
    `schema_versions에 검색 스키마 버전 ${params.version}이 없습니다. 이 패키지가 만든 스키마가 아닙니다.`,
  "schema.invalidRow": (params) => `검색 스키마의 ${params.table} 행 형태가 예상과 다릅니다.`,
  "schema.isolationNotReadCommitted": (params) =>
    `검색 스키마는 READ COMMITTED 트랜잭션에서 설치해야 합니다 (현재 ${params.isolation}).`,

  "grants.noRoles": "검색 스키마 권한을 줄 역할이 하나 이상 필요합니다.",
  "grants.duplicateRole": (params) =>
    `역할 ${quoted(params.role)}가 두 번 이상 나옵니다. 역할은 한 묶음에만 속해야 합니다.`,
  "grants.reservedRole": (params) =>
    `역할 ${quoted(params.role)}는 예약된 역할이라 검색 스키마 권한을 받을 수 없습니다.`,

  "pg.transactionConflict": (params) =>
    `동시에 실행된 트랜잭션과 충돌했습니다 (SQLSTATE ${params.sqlstate}). 트랜잭션 전체를 다시 실행하세요.`,
  "pg.lockTimeout": (params) =>
    `기다리는 동안 문장이 시간 제한에 걸렸거나 취소됐습니다 (SQLSTATE ${params.sqlstate}).`,
  "pg.schemaMissing": (params) =>
    `검색 스키마나 그 테이블이 없습니다 (SQLSTATE ${params.sqlstate}).`,
  "pg.insufficientPrivilege": (params) =>
    `데이터베이스 역할에 문장이 필요로 하는 권한이 없습니다 (SQLSTATE ${params.sqlstate}).`,
  "pg.readOnlyTransaction": "읽기 전용 트랜잭션에서는 쓸 수 없습니다.",
  "pg.failedTransaction": "트랜잭션이 이미 실패해 롤백해야 합니다.",
  "pg.checkViolation": (params) => `행이 CHECK 제약 ${quoted(params.constraint)}을 어겼습니다.`,
  "pg.revisionOutOfRange": (params) =>
    `리비전이 안전한 정수 범위를 벗어났습니다 (제약 ${quoted(params.constraint)}).`,
  "pg.duplicateObject": (params) =>
    `같은 이름의 데이터베이스 객체가 이미 있습니다 (SQLSTATE ${params.sqlstate}).`,
  "pg.undefinedObject": (params) =>
    `참조한 데이터베이스 객체(예: 역할)가 없습니다 (SQLSTATE ${params.sqlstate}).`,
  "pg.unavailable": (params) => `PostgreSQL을 사용할 수 없습니다 (SQLSTATE ${params.sqlstate}).`,
  "pg.driverError": "서버가 결과를 돌려주기 전에 PostgreSQL 드라이버가 실패했습니다.",
  "pg.statementFailed": (params) => `PostgreSQL 문장이 실패했습니다 (SQLSTATE ${params.sqlstate}).`,

  "sync.invalidOptions": (params) => `동기화 옵션 ${quoted(params.path)}가 올바르지 않습니다.`,
  "sync.invalidPrimary":
    "getPrimaryDatabase는 Knex 인스턴스나 살아 있는 Knex 트랜잭션을 돌려줘야 합니다.",
  "sync.primaryResolverFailed":
    "getPrimaryDatabase가 primary 데이터베이스를 찾는 중에 실패했습니다.",
  "sync.initializeAborted": "저장소 식별자를 읽기 전에 initialize()가 중단됐습니다.",
  "sync.initializeStoreMismatch": (params) =>
    `설정된 primary의 검색 저장소는 ${params.actual}인데 expectedStoreId는 ${params.expected}입니다.`,
  "sync.notTransaction":
    "markChanged에는 살아 있는 Knex 트랜잭션이 필요합니다. 넘긴 핸들은 트랜잭션이 아닙니다.",
  "sync.completedTransaction": "markChanged에 넘긴 트랜잭션은 이미 끝났습니다.",
  "sync.storeIdentityUninitialized":
    "검색 저장소 식별자가 정해지지 않았습니다. 변경을 표시하기 전에 expectedStoreId를 설정하거나 synchronization.initialize()를 기다리세요.",
  "sync.invalidMarkInput": (params) =>
    `markChanged 인자 ${quoted(params.field)}가 올바르지 않습니다.`,
  "sync.tooManyIds": (params) =>
    `markChanged가 ID ${params.count}개를 받았습니다. 한 번에 최대 ${params.max}개까지 받습니다.`,
  "sync.logicalKeyNotRegistered": (params) =>
    `logical key ${quoted(params.logicalKey)}가 namespace ${quoted(params.namespace)}에 등록되어 있지 않습니다.`,
  "sync.storeMismatch": (params) =>
    `트랜잭션은 검색 저장소 ${params.actual}에 속하지만 이 동기화는 저장소 ${params.expected}에 묶여 있습니다.`,
  "sync.noWriteTarget": (params) =>
    `namespace ${quoted(params.namespace)}의 ${quoted(params.logicalKey)}는 캡처가 active인데 등록된 쓰기 대상이 없습니다.`,
  "sync.invalidRow": (params) => `${params.statement} 문장이 예상과 다른 형태의 행을 돌려줬습니다.`,

  "delivery.invalidInput": (params) =>
    `delivery 저장소 연산 ${params.operation}이 올바르지 않은 ${quoted(params.field)}를 받았습니다.`,
  "delivery.invalidRow": (params) =>
    `delivery 문장 ${params.statement}이 예상과 다른 형태의 행을 돌려줬습니다.`,

  "heartbeat.invalidInput": (params) =>
    `워커 heartbeat가 올바르지 않은 ${quoted(params.field)}를 받았습니다.`,

  "bulk.invalidLimit": (params) =>
    `워커 한도 ${quoted(params.name)}가 bulk 전송이나 backoff에 쓸 수 없는 값입니다.`,

  "sonamu.notInitialized": "Sonamu 데이터베이스 설정이 초기화되지 않았습니다.",
  "sonamu.primaryIsTransaction":
    "Sonamu primary 데이터베이스가 트랜잭션으로 해석됐습니다 (Sonamu test 모드는 트랜잭션 하나를 공유합니다). 여기에는 풀을 가진 Knex 인스턴스가 필요합니다.",
  "sonamu.noActiveTransaction":
    'markChanged에는 활성 Sonamu "w" 트랜잭션(@transactional 또는 puri.transaction())이 필요합니다. 트랜잭션을 새로 열지 않습니다.',
  "sonamu.notTransactionWrapper": "markChangedIn에는 PuriTransactionWrapper가 필요합니다.",
  "sonamu.invalidSynchronization":
    "createSonamuSynchronization에는 markChanged 메서드를 가진 동기화가 필요합니다.",

  "sonamu.projectionScopeNotTransaction":
    "withProjectionScope에는 projection에 주어진 살아 있는 스냅샷 트랜잭션이 필요합니다.",

  "lifecycle.invalidOptions": (params) =>
    `검색 수명 주기 옵션 ${quoted(params.path)}가 올바르지 않습니다.`,

  "snapshot.invalidPrimary": "스냅샷을 열 primary 데이터베이스는 Knex 인스턴스여야 합니다.",
  "snapshot.primaryIsTransaction":
    "스냅샷에는 풀을 가진 Knex 인스턴스가 필요합니다. Knex는 중첩 트랜잭션의 격리 수준과 읽기 전용 옵션을 무시합니다.",
  "snapshot.invalidTimeouts": (params) =>
    `스냅샷 시간 제한 ${quoted(params.field)}는 1 이상 2147483647 이하의 정수 밀리초여야 합니다.`,
  "snapshot.notRepeatableRead": (params) =>
    `스냅샷 트랜잭션이 repeatable read가 아니라 ${params.isolation}로 실행됩니다.`,
  "snapshot.notReadOnly": "스냅샷 트랜잭션이 읽기 전용이 아닙니다.",
  "snapshot.onReplica":
    "스냅샷 트랜잭션이 복제본에서 실행됩니다. projection은 primary를 읽어야 합니다.",
  "snapshot.invalidRow": (params) =>
    `스냅샷 문장 ${params.statement}이 예상과 다른 형태의 행을 돌려줬습니다.`,

  "limits.unknownField": (params) => `알 수 없는 워커 한도 ${quoted(params.field)}입니다.`,
  "limits.invalidValue": (params) =>
    `워커 한도 ${quoted(params.field)}가 없거나 허용 범위를 벗어났습니다.`,
  "limits.heartbeatTooLong": (params) =>
    `heartbeatIntervalMs(${params.heartbeatIntervalMs}ms)는 leaseDurationMs(${params.leaseDurationMs}ms)의 절반 이하여야 합니다.`,
  "limits.timeoutExceedsLease": (params) =>
    `${params.field}(${params.timeoutMs}ms)는 leaseDurationMs(${params.leaseDurationMs}ms)보다 짧아야 합니다.`,
  "limits.retryDelayInverted": (params) =>
    `retryBaseDelayMs(${params.retryBaseDelayMs}ms)는 retryMaxDelayMs(${params.retryMaxDelayMs}ms)를 넘을 수 없습니다.`,
  "limits.retryAgeTooSmall": (params) =>
    `maxRetryAgeMs(${params.maxRetryAgeMs}ms)는 retryBaseDelayMs(${params.retryBaseDelayMs}ms)보다 커야 합니다. 그렇지 않으면 첫 재시도에서 예산이 소진됩니다.`,
  "limits.isolationBudgetTooSmall": (params) =>
    `maxIsolationCallsPerBatch(${params.maxIsolationCallsPerBatch})로는 문서 ${params.maxDocumentsPerClaim}개 중 실패하는 하나를 찾을 수 없습니다. 최소 ${params.required}번이 필요합니다.`,
  "limits.inFlightBelowBulk": (params) =>
    `maxInFlightBytes(${params.maxInFlightBytes})는 maxBulkBytes(${params.maxBulkBytes}) 이상이어야 합니다. 그렇지 않으면 bulk 한도에 가까운 문서를 붙잡을 수 없습니다.`,
  "limits.leaseTooShortForDrain": (params) =>
    `leaseDurationMs(${params.leaseDurationMs}ms)로는 heartbeat 사이에 임대가 끝나기 전 bulk 요청 하나를 보낼 수 없습니다. 최소 ${params.required}ms(requestTimeoutMs + heartbeatIntervalMs + 1)가 필요합니다.`,

  "materialize.invalidInput": (params) =>
    `materialize가 올바르지 않은 ${quoted(params.field)}를 받았습니다.`,
  "materialize.documentFailed": (params) => `문서를 materialize하지 못했습니다 (${params.reason}).`,

  "tracer.invalidKnex":
    "traceProjectionConnections에는 query 이벤트를 내보내는 Knex 인스턴스가 필요합니다.",
  "tracer.invalidSnapshot": "추적기의 스냅샷은 살아 있는 Knex 트랜잭션이어야 합니다.",

  "client.invalidOptions": (params) =>
    `검색 클라이언트 옵션 ${quoted(params.path)}가 올바르지 않습니다.`,
  "client.createFailed": "OpenSearch 클라이언트를 만들지 못했습니다.",
  "client.foreignClient": "createSearchClient로 만든 검색 클라이언트가 아닙니다.",
  "client.connectionFailed": "OpenSearch 연결에 실패했습니다.",
  "client.requestTimeout": "OpenSearch 요청이 제한 시간 안에 끝나지 않았습니다.",
  "client.responseError": (params) =>
    `OpenSearch가 상태 ${params.status}(${params.type})로 요청을 거부했습니다.`,
  "client.responseTooLarge": (params) => `OpenSearch 응답이 ${params.maxBytes}바이트를 넘습니다.`,
  "client.invalidResponse": "OpenSearch 응답을 패키지가 해석할 수 없습니다.",
  "client.requestFailed": "OpenSearch 요청이 실패했습니다.",
  "client.closeFailed": "소유한 OpenSearch 클라이언트를 닫지 못했습니다.",
  "client.conflictingBody": "요청에는 JSON 본문과 NDJSON 본문 중 하나만 담을 수 있습니다.",

  "worker.invalidOptions": (params) => `indexer 옵션 ${quoted(params.path)}가 올바르지 않습니다.`,
  "worker.duplicateDefinition": (params) =>
    `indexer가 ${quoted(params.key)}에 대해 fingerprint가 같은 정의를 두 번 받았습니다.`,
  "worker.invalidPrimary": "getPrimaryDatabase()가 Knex 인스턴스를 돌려주지 않았습니다.",
  "worker.primaryIsTransaction":
    "getPrimaryDatabase()가 트랜잭션을 돌려줬습니다. Knex는 중첩 트랜잭션에서 격리 수준과 읽기 전용 옵션을 무시하므로 워커에는 풀을 가진 Knex 인스턴스가 필요합니다.",
  "worker.unexpectedError": "drain이 예상하지 못한 오류로 실패했습니다.",
  "worker.statementTimeout": (params) =>
    `워커의 SQL 문장이 statementTimeoutMs(${params.timeoutMs}ms) 안에 끝나지 않았습니다.`,

  "query.invalidOptions": (params) => `검색 쿼리 옵션 ${quoted(params.path)}가 올바르지 않습니다.`,
  "query.duplicateSigningKey": (params) =>
    `커서 서명 키 ID ${quoted(params.keyId)}가 두 번 이상 쓰였습니다.`,
  "query.timeoutExceedsSearchLifetime": (params) =>
    `limits.timeoutMs(${params.timeoutMs}ms)가 limits.maxSearchLifetimeMs(${params.maxSearchLifetimeMs}ms)보다 깁니다.`,
  "query.invalidInput": (params) => `검색 입력 필드 ${quoted(params.path)}가 올바르지 않습니다.`,
  "query.bodyNotObject": "검색 본문은 JSON 객체여야 합니다.",
  "query.invalidBody": (params) =>
    `검색 본문이 올바른 JSON이 아닙니다: "${params.path}"에서 ${params.reason}.`,
  "query.unsupportedBodyKey": (params) =>
    `검색 본문 최상위 키 ${quoted(params.key)}는 관리형 검색에서 쓸 수 없습니다.`,
  "query.invalidBodyValue": (params) =>
    `검색 본문 필드 ${quoted(params.key)}의 값이 올바르지 않습니다.`,
  "query.sourceFieldNotAllowed": (params) =>
    `source 필드 ${quoted(params.field)}는 source 정책에서 허용되지 않습니다.`,
  "query.paginateRequiresSort": "페이지 조회에는 검색 본문의 명시적인 sort가 필요합니다.",
  "query.searchAfterWithCursor": "search_after와 커서를 함께 쓸 수 없습니다.",
  "query.cursorsNotConfigured": "커서를 쓰려면 쿼리 옵션에 커서 서명 키가 있어야 합니다.",
  "query.cursorTooLarge": (params) => `다음 커서가 ${params.maxLength}자를 넘습니다.`,
  "query.logicalKeyNotInCatalog": (params) =>
    `logical key ${quoted(params.logicalKey)}가 검색 카탈로그에 등록되어 있지 않습니다.`,
  "query.notReady": (params) =>
    `logical key ${quoted(params.logicalKey)}에는 아직 읽기 대상이 없습니다.`,
  "query.rebuildRequired": (params) =>
    `logical key ${quoted(params.logicalKey)}는 재빌드해야 검색할 수 있습니다.`,
  "query.unsupportedFingerprint": (params) =>
    `${quoted(params.logicalKey)}의 읽기 대상 fingerprint ${params.fingerprint}를 이 프로세스가 지원하지 않습니다.`,
  "query.unsupportedHashVersion": (params) =>
    `${quoted(params.logicalKey)}의 읽기 대상 해시 버전 ${quoted(params.hashVersion)}을 이 패키지 버전이 지원하지 않습니다.`,
  "query.lifetimeExceedsCatalog": (params) =>
    `설정한 ${params.limit}(${params.configured}ms)가 카탈로그 최대치(${params.maximum}ms)보다 깁니다.`,
  "query.targetNotReadable": (params) => `읽기 대상이 ${params.state} 상태라 검색할 수 없습니다.`,
  "query.invalidCatalogResult": "검색 카탈로그가 형식이 잘못된 결과를 돌려줬습니다.",
  "query.catalogFailed": "검색 카탈로그 조회에 실패했습니다.",
  "query.pitRequestRejected": "OpenSearch가 point-in-time 요청 형식을 거부했습니다.",
  "query.targetIndexMissing": "읽기 대상의 물리 인덱스가 없습니다.",

  "cursor.malformed": "커서 형식이 잘못됐습니다.",
  "cursor.tooLarge": (params) => `커서가 ${params.maxLength}자를 넘습니다.`,
  "cursor.invalidSignature": "커서 서명을 검증하지 못했습니다.",
  "cursor.invalidPayload": "커서 내용이 올바르지 않습니다.",
  "cursor.queryMismatch": "커서가 다른 검색 본문의 것입니다.",
  "cursor.expired": "커서가 만료됐습니다.",
  "cursor.targetMissing": "커서의 대상이 더 이상 없습니다.",
  "cursor.targetNotReadable": (params) =>
    `커서의 대상이 ${params.state} 상태라 더 이상 읽을 수 없습니다.`,
  "cursor.epochInvalidated": "커서의 대상이 무효화된 캡처 epoch에 속합니다.",
  "cursor.logicalKeyMismatch": "커서가 다른 logical key의 것입니다.",
  "cursor.fingerprintMismatch": "커서 대상의 fingerprint가 바뀌었습니다.",
  "cursor.pitClosed": "커서의 point in time이 닫혔거나 만료됐습니다.",

  "admin.invalidOptions": (params) => `관리 옵션 ${quoted(params.path)}이 올바르지 않습니다.`,
  "admin.invalidOperation": (params) =>
    `관리 작업 필드 ${quoted(params.path)}이 올바르지 않습니다.`,
  "admin.primaryResolverFailed": "getPrimaryDatabase가 primary 데이터베이스를 찾다가 실패했습니다.",
  "admin.invalidPrimary": "getPrimaryDatabase는 Knex 인스턴스를 돌려줘야 합니다.",
  "admin.primaryIsTransaction":
    "관리 작업은 자기 트랜잭션을 엽니다. getPrimaryDatabase는 트랜잭션이 아니라 풀을 가진 Knex 인스턴스를 돌려줘야 합니다.",
  "admin.notRegistered": (params) =>
    `namespace ${quoted(params.namespace)}에 logical key ${quoted(params.logicalKey)}의 인덱스 행이 없습니다. 먼저 대상 의도를 기록하세요.`,
  "admin.leaseBusy": (params) =>
    `다른 관리 작업이 ${quoted(params.logicalKey)}의 임대를 쥐고 있습니다. 그 작업이 끝나거나 임대가 만료된 뒤 다시 시도하세요.`,
  "admin.leaseLost": (params) =>
    `${quoted(params.logicalKey)}의 관리 임대가 교체되었거나 만료됐습니다. 아무것도 쓰지 않았습니다.`,
  "admin.invalidRow": (params) =>
    `관리 문장 ${params.statement}이 예상과 다른 형태의 행을 돌려줬습니다.`,
  "admin.invalidTargetIntent": (params) =>
    `대상 의도 필드 ${quoted(params.field)}이 올바르지 않습니다.`,
  "admin.targetIntentRefused": (params) =>
    `이 대상 식별자는 쓸 수 없습니다 (${params.reason}, 상태 ${params.state}).`,
  "admin.duplicateDefinition": (params) =>
    `${quoted(params.logicalKey)}의 정의 두 개가 같은 fingerprint를 가집니다.`,
  "admin.foreignHandle": "createSearchAdmin이 만든 관리 핸들이 아닙니다.",
  "admin.registrationRefused": (params) =>
    `대상을 등록할 수 없습니다 (${params.reason}, 상태 ${params.state}).`,
  "admin.definitionNotRegistered": (params) =>
    `관리 핸들에 이 fingerprint의 ${quoted(params.logicalKey)} 정의가 등록되어 있지 않습니다.`,
  "admin.definitionAmbiguous": (params) =>
    `${quoted(params.logicalKey)}의 정의가 ${params.count}개 등록되어 있습니다. planCreate에는 하나만 있어야 합니다.`,
  "admin.invalidPlan": (params) =>
    `생성 계획 필드 ${quoted(params.field)}이 올바르지 않거나 등록된 정의와 맞지 않습니다.`,
  "admin.pluginsMissing": (params) =>
    `${quoted(params.logicalKey)}에 필요한 플러그인 ${params.count}개가 모든 노드에 설치되어 있지 않습니다. 아무것도 만들지 않았습니다.`,
  "admin.remoteCreateAmbiguous": (params) =>
    `대상 ${params.targetId}의 생성 결과를 알 수 없습니다. 모든 생성 작업을 멈춘 뒤 reconcileCreate를 실행하세요.`,
  "admin.remoteCreateRejected": (params) =>
    `OpenSearch가 대상 ${params.targetId}의 인덱스를 거부했습니다. 이 식별자는 버려졌으니 새 계획이 필요합니다.`,
  "admin.remoteIndexConflict": (params) =>
    `대상 ${params.targetId}의 이름을 가진 인덱스가 이미 있지만 이 대상의 것이 아닙니다. 그대로 두었습니다.`,
  "admin.remoteCreateRefused": (params) =>
    `OpenSearch가 대상 ${params.targetId}의 생성을 거절했습니다 (HTTP ${params.status}). 같은 계획으로 다시 시도할 수 있습니다.`,
  "admin.registeredTargetUnavailable": (params) =>
    `등록된 대상 ${params.targetId}을 원격에서 쓸 수 없습니다 (${params.reason}). 다시 만들지 않으니 새 대상으로 재구축하세요.`,
  "admin.quiescenceNotConfirmed": (params) =>
    `대상 ${params.targetId}의 reconcileCreate에는 confirmQuiescent: true가 필요합니다.`,
  "admin.reconcileRefused": (params) =>
    `대상 ${params.targetId}을 조정할 수 없습니다 (${params.reason}). 아무것도 바꾸지 않았습니다.`,
  "admin.targetNotFound": (params) => `이 namespace에 대상 ${params.targetId}이 없습니다.`,
  "admin.invalidRemoteResponse": (params) =>
    `OpenSearch가 ${params.operation}에 예상과 다른 응답을 돌려줬습니다.`,
  "admin.leaseTooShort": (params) =>
    `관리 임대 ${params.leaseMs}ms로는 원격 호출과 결과 기록을 덮을 수 없습니다. 최소 ${params.requiredMs}ms가 필요합니다.`,
  "admin.invalidBuildArgument": (params) => `빌드 인수 ${quoted(params.path)}이 올바르지 않습니다.`,
  "admin.buildNotFound": (params) => `빌드 ${params.buildId}가 이 namespace에 없습니다.`,
  "admin.buildRefused": (params) =>
    `재구축을 시작할 수 없습니다 (${params.reason}, 상태 ${params.state}). 아무것도 바꾸지 않았습니다.`,
  "admin.backfillRefused": (params) =>
    `빌드 ${params.buildId}의 backfill 단계가 거부되었습니다 (${params.reason}). 아무것도 쓰지 않았습니다.`,
  "admin.scanFailed": (params) =>
    `${params.logicalKey}의 소스 스캔이 실패했습니다. 아무것도 쓰지 않았습니다.`,
  "admin.invalidScanResult": (params) =>
    `${params.logicalKey}의 소스 스캔이 올바르지 않은 ${quoted(params.field)}를 돌려줬습니다. 아무것도 쓰지 않았습니다.`,
  "admin.aborted": (params) => `관리 단계 ${params.operation}이 쓰기 전에 중단되었습니다.`,
  "admin.cutoverBlocked": (params) =>
    `빌드 ${params.buildId}의 cutover가 막혔습니다 (${params.reason}). 읽기 포인터는 그대로입니다.`,
  "admin.rollbackBlocked": (params) =>
    `빌드 ${params.buildId}의 rollback이 막혔습니다 (${params.reason}). 읽기 포인터는 그대로입니다.`,
  "admin.verificationFailed": (params) =>
    `빌드 ${params.buildId}의 표본 검증에서 문서 ${params.violations}개가 맞지 않습니다. 읽기 포인터는 그대로입니다.`,
  "admin.resumeRefused": (params) =>
    `${params.logicalKey}의 캡처를 재개하지 않았습니다 (${params.reason}). 아무것도 바꾸지 않았습니다.`,
  "admin.retirementRefused": (params) =>
    `대상 ${params.targetId}의 은퇴가 멈췄습니다 (${params.reason}). 끝난 단계는 남아 있고 같은 호출로 이어서 진행할 수 있습니다.`,
  "admin.invalidRepairArgument": (params) =>
    `복구 인수 ${quoted(params.path)}가 올바르지 않습니다.`,
  "admin.verificationRefused": (params) =>
    `대상 ${params.targetId}의 검증을 실행하지 않았습니다 (${params.reason}). 아무것도 쓰지 않았습니다.`,
  "admin.resumeTargetRefused": (params) =>
    `대상 ${params.targetId}를 재개하지 않았습니다 (${params.reason}). 아무것도 바꾸지 않았습니다.`,
  "admin.lifetimeChangeRefused": (params) =>
    `${params.logicalKey}에 기록된 ${params.field}를 ${params.recordedMs} ms에서 ${params.requestedMs} ms로 낮출 수 없습니다. 더 긴 값으로 발급된 커서가 아직 살아 있을 수 있고 은퇴 유예가 줄어듭니다. 아무것도 바꾸지 않았습니다.`,
  "query.bodyTooLarge": (params) => `검색 본문이 ${params.maxBytes}바이트를 넘습니다.`,
  "admin.clientNotConfigured": (params) =>
    `${params.operation}에는 OpenSearch 클라이언트가 필요한데 이 관리 핸들은 클라이언트 없이 만들어졌습니다. 아무것도 읽거나 쓰지 않았습니다.`,
  "indexMeta.invalidStoreId": "인덱스 _meta의 저장소 식별자는 소문자 UUID여야 합니다.",
  "binding.invalidRow": (params) =>
    `저장소 결속 문장 ${params.statement}이 예상과 다른 형태의 행을 돌려줬습니다.`,
  "binding.originUnrecorded": (params) =>
    `검색 저장소 ${params.storeId}에 기록된 원점 데이터베이스가 없습니다. confirmStoreOwnership이나 adoptCopiedStore를 실행하기 전까지 원격 작업을 거부합니다. 캡처는 계속됩니다.`,
  "binding.originChanged": (params) =>
    `검색 저장소 ${params.storeId}는 지금 연결된 것과 다른 데이터베이스에서 기록됐습니다 (복사 또는 복원). adoptCopiedStore나 confirmStoreOwnership을 실행하기 전까지 원격 작업을 거부합니다. 캡처는 계속됩니다.`,
  "binding.instanceMismatch": (params) =>
    `검색 저장소 ${params.storeId}는 설정된 것과 다른 instanceName에 결속돼 있어 원격 작업을 거부합니다. 캡처는 계속됩니다.`,
  "binding.remoteStoreMismatch": (params) =>
    `대상 ${params.targetId}의 인덱스는 검색 저장소 ${params.storeId}가 아니라 ${params.remoteStoreId}의 것입니다. 건드리지 않았습니다.`,
  "admin.copyNotConfirmed":
    "adoptCopiedStore에는 confirmCopy: true가 필요합니다. 아무것도 바꾸지 않았습니다.",
  "admin.ownershipNotConfirmed":
    "confirmStoreOwnership에는 confirmSoleOwner: true가 필요합니다. 아무것도 바꾸지 않았습니다.",
  "admin.invalidOwnershipInput": (params) =>
    `저장소 소유권 입력 ${quoted(params.path)}이 올바르지 않습니다. 아무것도 바꾸지 않았습니다.`,
  "admin.instanceNameConflict":
    "instanceName 인수가 이 동기화에 설정된 instanceName과 다릅니다. 아무것도 바꾸지 않았습니다.",
  "admin.targetDetached": (params) =>
    `대상 ${params.targetId}는 adoptCopiedStore가 떼어 낸 대상입니다. 어떤 작업도 이 대상에 적용하지 않습니다.`,

  "catalog.invalidOptions": (params) =>
    `카탈로그 reader 옵션 ${quoted(params.path)}이 올바르지 않습니다.`,
  "catalog.invalidArgument": (params) =>
    `카탈로그 조회 인수 ${quoted(params.path)}이 올바르지 않습니다.`,
  "catalog.primaryResolverFailed":
    "카탈로그 조회용 primary 데이터베이스를 찾다가 getPrimaryDatabase가 실패했습니다.",
  "catalog.invalidPrimary": "getPrimaryDatabase는 Knex 인스턴스를 돌려줘야 합니다.",
  "catalog.primaryIsTransaction":
    "카탈로그 조회는 애플리케이션 트랜잭션을 쓰지 않습니다. getPrimaryDatabase는 풀을 가진 Knex 인스턴스를 돌려줘야 합니다.",
  "catalog.timeout": (params) => `카탈로그 조회가 ${params.timeoutMs}ms 안에 끝나지 않았습니다.`,
  "catalog.aborted": "카탈로그 조회가 중단됐습니다.",
  "catalog.failed": "카탈로그 조회에 실패했습니다.",
  "catalog.invalidRow": (params) =>
    `카탈로그 문장 ${params.statement}이 예상과 다른 형태의 행을 돌려줬습니다.`,

  "documentId.reserved": "패키지가 예약한 문서 ID입니다 (대상 fence).",
  "limits.fenceIntervalBelowRequest": (params) =>
    `fenceRenewIntervalMs(${params.fenceRenewIntervalMs}ms)는 requestTimeoutMs(${params.requestTimeoutMs}ms) 이상이어야 합니다. fence 전진 한 번이 갱신 간격 안에 끝나야 합니다.`,
  "fence.invalidRow": (params) =>
    `fence 문장 ${params.statement}이 예상과 다른 형태의 행을 돌려줬습니다.`,
  "fence.invalidInput": (params) => `fence 작업 ${params.operation}의 입력이 잘못됐습니다.`,
  "fence.lost": (params) =>
    `대상 ${params.targetId}의 fence를 다른 데이터베이스가 가졌습니다 (${params.class}: 이쪽 epoch ${params.localEpoch}, 원격 epoch ${params.remoteEpoch}). confirmStoreOwnership(정당한 소유자에서)이나 adoptCopiedStore(복사본에서)를 실행하기 전까지 이 데이터베이스는 그 대상에 아무것도 보내지 않습니다.`,
  "fence.unreadable": (params) =>
    `대상 ${params.targetId}의 fence를 읽지 못해 아무것도 바꾸지 않았습니다. OpenSearch가 응답하면 다시 시도하세요.`,
  "fence.takeoverContended": (params) =>
    `대상 ${params.targetId}의 fence가 인수 시도 ${params.attempts}번 동안 계속 움직였습니다. 다른 데이터베이스가 아직 쓰고 있습니다. 먼저 멈추세요.`,
  "cli.command.inspect":
    "logical key의 대상, 읽기 헤드, 열린 빌드, 워커, 저장소 결속을 보여 줍니다.",
  "cli.command.init": "첫 대상을 만들고 등록해 읽기에 올리거나, 현재 정의로 재구성 빌드를 엽니다.",
  "cli.command.backfill": "빌드의 원본 스캔을 끝까지 진행합니다.",
  "cli.command.cutover":
    "빌드의 cutover 차단 사유를 보여 준 뒤 읽기 포인터를 새 대상으로 옮깁니다.",
  "cli.command.rollback": "serving 빌드를 옛 대상으로 되돌립니다.",
  "cli.command.retireOld": "읽기에서 빠진 대상을 은퇴시킵니다. 읽기 유예 중이면 거부됩니다.",
  "cli.command.suspend": "캡처를 중단합니다. 재개한 빌드를 cutover할 때까지 검색을 쓸 수 없습니다.",
  "cli.command.resume": "새 epoch로 캡처를 재개합니다. 그다음 backfill과 cutover를 실행하세요.",
  "cli.command.verify": "정지된 대상의 색인 버전을 원장과 비교합니다.",
  "cli.command.resumeTarget": "검증을 마친 정지 대상을 다시 활성화합니다.",
  "cli.command.reconcile":
    "in_flight나 ambiguous 생성 시도를 정리합니다. 다른 생성 시도가 돌지 않을 때만 승인하세요.",
  "cli.command.remark": "문서를 다시 표시해 새 리비전으로 색인되게 합니다.",
  "cli.command.retryQuarantined": "격리된 문서를 다시 전달 가능하게 만듭니다.",
  "cli.command.drain": "대기 중인 문서가 없을 때까지 색인 워커를 실행합니다 (개발용).",
  "cli.command.adoptStore":
    "이 데이터베이스를 다른 저장소의 복사본으로 선언합니다: 새 store ID, 캡처 중단, 물려받은 대상 분리.",
  "cli.command.confirmOwnership":
    "이 데이터베이스가 기록된 저장소 그 자체임을 선언하고(제자리 복원, 이름 변경, 서버 이전) 원점을 다시 기록합니다.",
  "cli.argument.logicalKey": "logical key. 하나만 정의돼 있으면 생략할 수 있습니다.",
  "cli.option.build": "빌드 ID. 생략하면 열린 빌드입니다.",
  "cli.option.target": "대상 ID.",
  "cli.option.retireTarget": "대상 ID. 생략하면 읽기에서 빠진 모든 대상입니다.",
  "cli.option.limit": "페이지당 행 수.",
  "cli.option.ids": "문서 ID. 여러 개면 플래그를 반복하세요.",
  "cli.option.scan": "원본이나 원장을 스캔합니다.",
  "cli.option.after": "이 커서 다음부터 스캔합니다.",
  "cli.option.through": "이 커서까지 스캔합니다.",
  "cli.option.maxRounds": "이 횟수만큼 drain한 뒤 멈춥니다.",
  "cli.option.operationId": "감사 operation ID. 생략하면 만들어집니다.",
  "cli.option.actor": "감사 actor. 생략하면 운영체제 사용자입니다.",
  "cli.option.reason": "감사 사유.",
  "cli.invalidOptions": (params) => `검색 CLI 플러그인 옵션 ${params.path}이 잘못됐습니다.`,
  "cli.invalidSetup": (params) => `load가 돌려준 검색 CLI 설정의 ${params.path}이 잘못됐습니다.`,
  "cli.invalidInput": (params) => `${params.name}의 값이 잘못됐습니다.`,
  "cli.logicalKeyRequired": (params) => `logical key를 지정하세요: ${params.keys} 중 하나입니다.`,
  "cli.logicalKeyUnknown": (params) =>
    `logical key ${quoted(params.logicalKey)}는 정의돼 있지 않습니다. ${params.keys} 중 하나를 쓰세요.`,
  "cli.remarkScopeRequired": "--ids나 --scan을 지정하세요.",
  "cli.noOpenBuild": (params) =>
    `logical key ${quoted(params.logicalKey)}에 열린 빌드가 없습니다. --build를 지정하거나 먼저 init을 실행하세요.`,
  "cli.verificationViolations": (params) =>
    `대상 ${params.targetId}의 검증에서 위반 ${params.violations}건을 찾았습니다.`,
  "cli.workerCooldown": (params) =>
    `워커가 인프라 장애 뒤 냉각 중입니다. ${params.cooldownRemainingMs}ms 뒤에 다시 시도하세요.`,
  "cli.drainRefused": (params) => `워커가 drain을 거부했습니다 (${params.code}).`,
  "cli.storeMismatchHint":
    "이 데이터베이스가 다른 데이터베이스의 복사본이나 복원본이면 'sonamu search adopt-store'를, 같은 저장소이면(이름 변경, 제자리 복원, 서버 이전) 'sonamu search confirm-ownership'을 실행하세요.",
};
