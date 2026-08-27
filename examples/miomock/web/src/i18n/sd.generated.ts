/**
 * @generated
 * 직접 수정하지 마세요.
 */

const DEFAULT_LOCALE = "ko" as const;
export const SUPPORTED_LOCALES = ["ko", "en", "ja"] as const;
let currentLocale: (typeof SUPPORTED_LOCALES)[number] = DEFAULT_LOCALE;

export function setLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
  currentLocale = locale;
}

export function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  return currentLocale;
}

import en from "./en";
import ja from "./ja";
import ko from "./ko";

// react-components i18n keys
const rcKeysKo = {
  // AsyncSelect Component
  "rc.asyncSelect.loading": "로딩 중...",
  "rc.asyncSelect.noOptions": "옵션이 없습니다",
  "rc.asyncSelect.noResults": "검색 결과가 없습니다",
  "rc.asyncSelect.selectPlaceholder": "선택하세요...",

  // Combobox Component
  "rc.combobox.noResults": "검색 결과가 없습니다",
  "rc.combobox.selectPlaceholder": "선택하세요...",

  // DatePicker Component
  "rc.datePicker.pickDate": "날짜 선택",
  "rc.datePicker.placeholder": "날짜 선택",
  "rc.datePicker.selectDate": "날짜 선택",

  // DateSelectorMultiple Component
  "rc.dateSelectorMultiple.addDate": "날짜 추가",
  "rc.dateSelectorMultiple.dateRange": "기간",
  "rc.dateSelectorMultiple.placeholder": "날짜 선택",
  "rc.dateSelectorMultiple.singleDate": "단일",

  // FileInput Component
  "rc.fileInput.browseFiles": "파일 찾기",
  "rc.fileInput.dropZone": "파일을 드래그하거나 클릭하여 업로드",
  "rc.fileInput.filePlaceholder": "파일",
  "rc.fileInput.imagePlaceholder": "이미지",
  "rc.fileInput.maxFilesExceeded": (maxFiles: number) =>
    `최대 ${maxFiles}개 파일만 업로드 가능합니다`,
  "rc.fileInput.pending": "대기 중",
  "rc.fileInput.remove": "제거",
  "rc.fileInput.uploadFailed": "업로드 실패",
  "rc.fileInput.uploading": "업로드 중...",

  // MonthPickerMultiple Component
  "rc.monthPickerMultiple.addMonth": "월 추가",
  "rc.monthPickerMultiple.dateRange": "기간",
  "rc.monthPickerMultiple.endDate": "종료일",
  "rc.monthPickerMultiple.placeholder": "월 선택",
  "rc.monthPickerMultiple.singleDate": "단일",
  "rc.monthPickerMultiple.startDate": "시작일",

  // MultiSelect Component
  "rc.multiSelect.clear": "전체 해제",
  "rc.multiSelect.close": "닫기",
  "rc.multiSelect.moreItems": (count: number) => `+${count}개 더보기`,
  "rc.multiSelect.noOptions": "옵션이 없습니다",
  "rc.multiSelect.noOptionsSelected": "선택된 옵션이 없습니다",
  "rc.multiSelect.noResults": "검색 결과가 없습니다",
  "rc.multiSelect.optionsCount": (count: number) => `${count}개 옵션`,
  "rc.multiSelect.selectAll": "전체 선택",
  "rc.multiSelect.selectPlaceholder": "선택하세요...",

  // Pagination Component
  "rc.pagination.next": "다음",
  "rc.pagination.previous": "이전",
  "rc.pagination.showing": (start: number, end: number, total: number) =>
    `${total}개 중 ${start}-${end}`,

  // Calendar Component
  "rc.calendar.month.0": "1월",
  "rc.calendar.month.1": "2월",
  "rc.calendar.month.2": "3월",
  "rc.calendar.month.3": "4월",
  "rc.calendar.month.4": "5월",
  "rc.calendar.month.5": "6월",
  "rc.calendar.month.6": "7월",
  "rc.calendar.month.7": "8월",
  "rc.calendar.month.8": "9월",
  "rc.calendar.month.9": "10월",
  "rc.calendar.month.10": "11월",
  "rc.calendar.month.11": "12월",

  // Sonamu Filter Component
  "rc.sonamuFilter.title": "소나무 필터",
  "rc.sonamuFilter.apply": "적용",
  "rc.sonamuFilter.reset": "초기화",
  "rc.sonamuFilter.addRule": "규칙 추가",
  "rc.sonamuFilter.noRulesYet": '아직 규칙이 없습니다. "+ 규칙 추가"를 클릭하여 시작하세요.',
  "rc.sonamuFilter.selectField": "필드 선택",
  "rc.sonamuFilter.selectOperator": "연산자 선택",
  "rc.sonamuFilter.selectOperatorFirst": "먼저 연산자를 선택하세요",
  "rc.sonamuFilter.enterValue": "값 입력",
  "rc.sonamuFilter.enterNumber": "숫자 입력",
  "rc.sonamuFilter.notSupported": "지원하지 않음",
  "rc.sonamuFilter.startDate": "시작일",
  "rc.sonamuFilter.endDate": "종료일",
  "rc.sonamuFilter.appliedFilters": "🌲 적용된 소나무 필터",

  // Common
  "rc.common.cancel": "취소",
  "rc.common.save": "저장",
};

const rcKeysEn = {
  // AsyncSelect Component
  "rc.asyncSelect.loading": "Loading...",
  "rc.asyncSelect.noOptions": "No options",
  "rc.asyncSelect.noResults": "No results",
  "rc.asyncSelect.selectPlaceholder": "Select...",

  // Combobox Component
  "rc.combobox.noResults": "No results",
  "rc.combobox.selectPlaceholder": "Select...",

  // DatePicker Component
  "rc.datePicker.pickDate": "Pick date",
  "rc.datePicker.placeholder": "Pick date",
  "rc.datePicker.selectDate": "Select date",

  // DateSelectorMultiple Component
  "rc.dateSelectorMultiple.addDate": "Add date",
  "rc.dateSelectorMultiple.dateRange": "Range",
  "rc.dateSelectorMultiple.placeholder": "Pick date",
  "rc.dateSelectorMultiple.singleDate": "Single",

  // FileInput Component
  "rc.fileInput.browseFiles": "Browse files",
  "rc.fileInput.dropZone": "Drag files here or click to upload",
  "rc.fileInput.filePlaceholder": "File",
  "rc.fileInput.imagePlaceholder": "Image",
  "rc.fileInput.maxFilesExceeded": (maxFiles: number) => `Maximum ${maxFiles} files allowed`,
  "rc.fileInput.pending": "Pending",
  "rc.fileInput.remove": "Remove",
  "rc.fileInput.uploadFailed": "Upload failed",
  "rc.fileInput.uploading": "Uploading...",

  // MonthPickerMultiple Component
  "rc.monthPickerMultiple.addMonth": "Add month",
  "rc.monthPickerMultiple.dateRange": "Range",
  "rc.monthPickerMultiple.endDate": "End date",
  "rc.monthPickerMultiple.placeholder": "Pick month",
  "rc.monthPickerMultiple.singleDate": "Single",
  "rc.monthPickerMultiple.startDate": "Start date",

  // MultiSelect Component
  "rc.multiSelect.clear": "Clear all",
  "rc.multiSelect.close": "Close",
  "rc.multiSelect.moreItems": (count: number) => `+${count} more`,
  "rc.multiSelect.noOptions": "No options",
  "rc.multiSelect.noOptionsSelected": "No options selected",
  "rc.multiSelect.noResults": "No results",
  "rc.multiSelect.optionsCount": (count: number) => `${count} options`,
  "rc.multiSelect.selectAll": "Select all",
  "rc.multiSelect.selectPlaceholder": "Select...",

  // Pagination Component
  "rc.pagination.next": "Next",
  "rc.pagination.previous": "Previous",
  "rc.pagination.showing": (start: number, end: number, total: number) =>
    `Showing ${start}-${end} of ${total}`,

  // Calendar Component
  "rc.calendar.month.0": "January",
  "rc.calendar.month.1": "February",
  "rc.calendar.month.2": "March",
  "rc.calendar.month.3": "April",
  "rc.calendar.month.4": "May",
  "rc.calendar.month.5": "June",
  "rc.calendar.month.6": "July",
  "rc.calendar.month.7": "August",
  "rc.calendar.month.8": "September",
  "rc.calendar.month.9": "October",
  "rc.calendar.month.10": "November",
  "rc.calendar.month.11": "December",

  // Sonamu Filter Component
  "rc.sonamuFilter.title": "Sonamu Filter",
  "rc.sonamuFilter.apply": "Apply",
  "rc.sonamuFilter.reset": "Reset",
  "rc.sonamuFilter.addRule": "Add Rule",
  "rc.sonamuFilter.noRulesYet": 'No rules yet. Click "+ Add Rule" to start.',
  "rc.sonamuFilter.selectField": "Select field",
  "rc.sonamuFilter.selectOperator": "Operator",
  "rc.sonamuFilter.selectOperatorFirst": "Select operator first",
  "rc.sonamuFilter.enterValue": "Enter value",
  "rc.sonamuFilter.enterNumber": "Enter number",
  "rc.sonamuFilter.notSupported": "Not supported",
  "rc.sonamuFilter.startDate": "Start date",
  "rc.sonamuFilter.endDate": "End date",
  "rc.sonamuFilter.appliedFilters": "🌲 Applied SonamuFilters",

  // Common
  "rc.common.cancel": "Cancel",
  "rc.common.save": "Save",
} as const;

// entity.json에서 추출한 entity labels (defaultLocale 전용)
const entityLabels = {
  "entity.Account": "계정",
  "entity.Account.id": "ID",
  "entity.Account.account_id": "계정 ID",
  "entity.Account.provider_id": "제공자 ID",
  "entity.Account.user": "사용자",
  "entity.Account.access_token": "액세스 토큰",
  "entity.Account.refresh_token": "리프레시 토큰",
  "entity.Account.id_token": "ID 토큰",
  "entity.Account.access_token_expires_at": "액세스 토큰 만료일시",
  "entity.Account.refresh_token_expires_at": "리프레시 토큰 만료일시",
  "entity.Account.scope": "스코프",
  "entity.Account.password": "비밀번호",
  "entity.Account.created_at": "생성일시",
  "entity.Account.updated_at": "수정일시",
  "enum.AccountOrderBy.id-desc": "ID최신순",
  "enum.AccountSearchField.id": "ID",
  "entity.AuditEvent": "감사이벤트",
  "entity.AuditEvent.id": "ID",
  "entity.AuditEvent.source": "이벤트 소스",
  "entity.AuditEvent.source_version": "소스 버전",
  "entity.AuditEvent.category": "카테고리",
  "entity.AuditEvent.event_type": "이벤트 타입",
  "entity.AuditEvent.event_key": "이벤트 키",
  "entity.AuditEvent.dedupe_key": "중복 제거 키",
  "entity.AuditEvent.actor_user_id": "액터 사용자 ID",
  "entity.AuditEvent.subject_user_id": "대상 사용자 ID",
  "entity.AuditEvent.organization_id": "조직 ID",
  "entity.AuditEvent.team_id": "팀 ID",
  "entity.AuditEvent.session_id": "세션 ID",
  "entity.AuditEvent.provider_id": "프로바이더 ID",
  "entity.AuditEvent.login_method": "로그인 방식",
  "entity.AuditEvent.identifier": "식별자",
  "entity.AuditEvent.visitor_id": "방문자 ID",
  "entity.AuditEvent.reason": "사유",
  "entity.AuditEvent.action": "액션",
  "entity.AuditEvent.trigger_context": "트리거 컨텍스트",
  "entity.AuditEvent.ip_address": "IP 주소",
  "entity.AuditEvent.country_code": "국가 코드",
  "entity.AuditEvent.country": "국가",
  "entity.AuditEvent.city": "도시",
  "entity.AuditEvent.user_agent": "User-Agent",
  "entity.AuditEvent.payload_json": "원본 payload",
  "entity.AuditEvent.occurred_at": "발생 시각",
  "entity.AuditEvent.ingested_at": "적재 시각",
  "enum.AuditEventOrderBy.id-desc": "ID최신순",
  "enum.AuditEventSearchField.id": "ID",
  "enum.AuditEventCategory.user": "사용자",
  "enum.AuditEventCategory.session": "세션",
  "enum.AuditEventCategory.account": "계정",
  "enum.AuditEventCategory.verification": "인증",
  "enum.AuditEventCategory.organization": "조직",
  "enum.AuditEventCategory.security": "보안",
  "entity.AuditLog": "감사로그",
  "entity.AuditLog.id": "ID",
  "entity.AuditLog.created_at": "등록일시",
  "entity.AuditLog.actor_id": "액터 ID",
  "entity.AuditLog.action": "액션",
  "entity.AuditLog.entity_type": "대상 엔티티",
  "entity.AuditLog.entity_id": "대상 레코드 ID",
  "entity.AuditLog.old_value": "변경 전 값",
  "entity.AuditLog.new_value": "변경 후 값",
  "enum.AuditLogOrderBy.id-desc": "ID최신순",
  "enum.AuditLogSearchField.id": "ID",
  "enum.AuditLogAction.create": "생성",
  "enum.AuditLogAction.update": "수정",
  "enum.AuditLogAction.delete": "삭제",
  "entity.Company": "COMPANY",
  "entity.Company.id": "ID",
  "entity.Company.created_at": "등록일시",
  "entity.Company.name": "회사명",
  "enum.CompanyOrderBy.id-desc": "ID최신순",
  "enum.CompanySearchField.id": "ID",
  "enum.CompanySearchField.name": "회사명",
  "entity.Department": "부서",
  "entity.Department.id": "ID",
  "entity.Department.created_at": "등록일시",
  "entity.Department.name": "부서명",
  "entity.Department.company": "회사",
  "entity.Department.parent": "상위부서",
  "entity.Department.employees": "직원리스트",
  "entity.Department.code": "부서번호",
  "entity.Department.employee_count": "직원수",
  "enum.DepartmentOrderBy.id-desc": "ID최신순",
  "enum.DepartmentOrderBy.name-asc": "부서명오름차순",
  "enum.DepartmentSearchField.id": "ID",
  "enum.DepartmentSearchField.name": "부서명",
  "entity.Document": "DOCUMENT",
  "entity.Document.id": "ID",
  "entity.Document.created_at": "등록일시",
  "entity.Document.title": "제목",
  "entity.Document.content": "내용",
  "entity.Document.status": "상태",
  "entity.Document.title_content_embedding": "임베딩 내용 (title_content)",
  "enum.DocumentOrderBy.id-desc": "ID최신순",
  "enum.DocumentSearchField.id": "ID",
  "enum.DocumentStatus.draft": "초안",
  "enum.DocumentStatus.published": "게시됨",
  "enum.DocumentStatus.archived": "보관됨",
  "entity.Employee": "직원",
  "entity.Employee.id": "ID",
  "entity.Employee.created_at": "등록일시",
  "entity.Employee.user": "USER",
  "entity.Employee.department": "부서",
  "entity.Employee.employee_number": "사번",
  "entity.Employee.salary": "SALARY",
  "entity.Employee.hire_date": "입사일",
  "entity.Employee.notes": "비고",
  "entity.Employee.projs": "참여중인 프로젝트",
  "enum.EmployeeOrderBy.id-desc": "ID최신순",
  "enum.EmployeeSearchField.id": "ID",
  "enum.EmployeeSearchField.employee_number": "사번",
  "entity.File": "FILE",
  "entity.File.id": "ID",
  "entity.File.created_at": "등록일시",
  "entity.File.mime_type": "MIME타입",
  "entity.File.name": "FILE명",
  "entity.File.url": "URL",
  "enum.FileOrderBy.id-desc": "ID최신순",
  "enum.FileSearchField.id": "ID",
  "entity.Milestone": "마일스톤",
  "entity.Milestone.id": "ID",
  "entity.Milestone.created_at": "등록일시",
  "entity.Milestone.project": "프로젝트",
  "entity.Milestone.name": "마일스톤명",
  "entity.Milestone.description": "설명",
  "entity.Milestone.due_date": "마감일",
  "entity.Milestone.completed_at": "완료일시",
  "enum.MilestoneOrderBy.id-desc": "ID최신순",
  "enum.MilestoneOrderBy.due_date-asc": "마감일순",
  "enum.MilestoneSearchField.id": "ID",
  "entity.Passkey": "패스키",
  "entity.Passkey.id": "ID",
  "entity.Passkey.name": "패스키 이름",
  "entity.Passkey.public_key": "공개키",
  "entity.Passkey.credential_id": "자격 증명 ID",
  "entity.Passkey.counter": "카운터",
  "entity.Passkey.device_type": "장치 유형",
  "entity.Passkey.backed_up": "백업 여부",
  "entity.Passkey.transports": "전송 방식",
  "entity.Passkey.aaguid": "AAGUID",
  "entity.Passkey.created_at": "생성일시",
  "entity.Passkey.user": "사용자",
  "enum.PasskeyOrderBy.id-desc": "ID최신순",
  "enum.PasskeyOrderBy.created_at-desc": "생성일최신순",
  "enum.PasskeySearchField.id": "ID",
  "enum.PasskeySearchField.name": "이름",
  "entity.Project": "PROJECT",
  "entity.Project.id": "ID",
  "entity.Project.created_at": "등록일시",
  "entity.Project.employee": "직원",
  "entity.Project.name": "PROJECT명",
  "entity.Project.status": "상태",
  "entity.Project.description": "설명",
  "entity.Project.budget": "예산",
  "entity.Project.deadline": "마감일시",
  "entity.Project.tags": "TAG리스트",
  "entity.Project.image_urls": "이미지URLS",
  "entity.Project.virtual_test": "virtual prop test",
  "entity.Project.virtual_query_test": "virtual query prop test",
  "entity.Project.textsearchable_index_col": "FTS 테스트용",
  "enum.ProjectOrderBy.id-desc": "ID최신순",
  "enum.ProjectOrderBy.deadline-asc": "마감일최신순",
  "enum.ProjectSearchField.id": "ID",
  "enum.ProjectStatus.planning": "계획",
  "enum.ProjectStatus.in_progress": "진행중",
  "enum.ProjectStatus.completed": "완료",
  "enum.ProjectStatus.cancelled": "취소",
  "entity.Session": "세션",
  "entity.Session.id": "ID",
  "entity.Session.expires_at": "만료일시",
  "entity.Session.token": "토큰",
  "entity.Session.created_at": "생성일시",
  "entity.Session.updated_at": "수정일시",
  "entity.Session.ip_address": "IP 주소",
  "entity.Session.user_agent": "User Agent",
  "entity.Session.user": "사용자",
  "entity.Session.impersonated_by": "대리 로그인한 관리자 ID",
  "enum.SessionOrderBy.id-desc": "ID최신순",
  "enum.SessionSearchField.id": "ID",
  "entity.SyncFixture": "Syncer 테스트 픽스처",
  "entity.SyncFixture.id": "ID",
  "entity.SyncFixture.created_at": "등록일시",
  "entity.SyncFixture.updated_at": "수정일시",
  "entity.SyncFixture.name": "이름",
  "entity.SyncFixture.code": "코드",
  "entity.SyncFixture.status": "상태",
  "entity.SyncFixture.priority": "우선순위",
  "entity.SyncFixture.is_active": "활성여부",
  "entity.SyncFixture.description": "설명",
  "entity.SyncFixture.tags": "태그목록",
  "enum.SyncFixtureStatus.draft": "초안",
  "enum.SyncFixtureStatus.pending": "대기중",
  "enum.SyncFixtureStatus.active": "활성",
  "enum.SyncFixtureStatus.completed": "완료",
  "enum.SyncFixtureStatus.archived": "보관",
  "enum.SyncFixtureOrderBy.id-desc": "ID최신순",
  "enum.SyncFixtureOrderBy.id-asc": "ID오래된순",
  "enum.SyncFixtureOrderBy.name-asc": "이름오름차순",
  "enum.SyncFixtureOrderBy.priority-desc": "우선순위높은순",
  "enum.SyncFixtureOrderBy.created_at-desc": "등록일최신순",
  "enum.SyncFixtureSearchField.id": "ID",
  "enum.SyncFixtureSearchField.name": "이름",
  "enum.SyncFixtureSearchField.code": "코드",
  "entity.Tag": "TAG",
  "entity.Tag.id": "ID",
  "entity.Tag.created_at": "등록일시",
  "entity.Tag.name": "태그명",
  "entity.Tag.name_ko": "태그명 한국어",
  "entity.Tag.name_en": "태그명 영어",
  "enum.TagOrderBy.id-desc": "ID최신순",
  "enum.TagSearchField.id": "ID",
  "entity.TwoFactor": "2FA 설정",
  "entity.TwoFactor.id": "ID",
  "entity.TwoFactor.secret": "비밀 키",
  "entity.TwoFactor.backup_codes": "백업 코드",
  "entity.TwoFactor.created_at": "생성일시",
  "entity.TwoFactor.updated_at": "수정일시",
  "entity.TwoFactor.user": "사용자",
  "enum.TwoFactorOrderBy.id-desc": "ID최신순",
  "enum.TwoFactorSearchField.id": "ID",
  "entity.User": "USER",
  "entity.User.id": "ID",
  "entity.User.created_at": "등록일시",
  "entity.User.email": "이메일",
  "entity.User.username": "이름",
  "entity.User.password": "비밀번호",
  "entity.User.birth_date": "생일",
  "entity.User.role": "ROLE",
  "entity.User.last_login_at": "LASTLOGIN일시",
  "entity.User.bio": "BIO",
  "entity.User.is_verified": "ISVERIFIED",
  "entity.User.deleted_at": "삭제일시",
  "entity.User.employee": "직원",
  "entity.User.image": "프로필 이미지",
  "entity.User.updated_at": "수정일시",
  "entity.User.two_factor_enabled": "2FA 활성화 여부",
  "entity.User.banned": "차단 여부",
  "entity.User.ban_reason": "차단 사유",
  "entity.User.ban_expires": "차단 만료",
  "enum.UserOrderBy.id-desc": "ID최신순",
  "enum.UserSearchField.id": "ID",
  "enum.UserRole.normal": "노멀",
  "enum.UserRole.admin": "관리자",
  "entity.Verification": "인증",
  "entity.Verification.id": "ID",
  "entity.Verification.identifier": "식별자",
  "entity.Verification.value": "값",
  "entity.Verification.expires_at": "만료일시",
  "entity.Verification.created_at": "생성일시",
  "entity.Verification.updated_at": "수정일시",
  "enum.VerificationOrderBy.id-desc": "ID최신순",
  "enum.VerificationSearchField.id": "ID",
} as const;

// defaultLocale의 dictionary를 기준으로 키 추출
type RCKeys = typeof rcKeysKo;
type ProjectDictionary = typeof ko;
type EntityLabels = typeof entityLabels;
type RawMergedDictionary = RCKeys &
  Omit<EntityLabels, keyof (RCKeys & ProjectDictionary)> &
  ProjectDictionary;

// 키는 유지하되, 값 타입은 string 또는 함수로 일반화 (다른 locale의 리터럴 타입 충돌 방지)
export type MergedDictionary = {
  [K in keyof RawMergedDictionary]: RawMergedDictionary[K] extends (...args: infer P) => string
    ? (...args: P) => string
    : string;
};
export type DictKey = keyof MergedDictionary;
export type LocalizedString = string & { __brand: "LocalizedString" };

export function defineLocale(dict: Partial<MergedDictionary>) {
  return dict;
}

// 각 locale별로 rc-keys + entity labels + 프로젝트 dict 합침
type DictionaryRegistry = {
  [L in (typeof SUPPORTED_LOCALES)[number]]: Partial<MergedDictionary>;
};
const dictionaries: DictionaryRegistry = {
  ko: { ...rcKeysKo, ...entityLabels, ...ko },
  en: { ...rcKeysEn, ...en },
  ja: { ...rcKeysKo, ...ja },
};

type SDReturnType<K extends DictKey> = MergedDictionary[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(
  key: K,
  locale: (typeof SUPPORTED_LOCALES)[number],
): SDReturnType<K> {
  // 1. 지정된 locale에서 조회
  const dict = dictionaries[locale];
  if (dict?.[key] !== undefined) {
    // SAFETY: 요청 locale의 같은 키는 MergedDictionary가 정한 반환 종류를 유지합니다.
    return dict[key] as SDReturnType<K>;
  }

  // 2. default locale에서 조회
  if (locale !== DEFAULT_LOCALE && dictionaries[DEFAULT_LOCALE]?.[key] !== undefined) {
    // SAFETY: 기본 locale의 같은 키는 MergedDictionary가 정한 반환 종류를 유지합니다.
    return dictionaries[DEFAULT_LOCALE][key] as SDReturnType<K>;
  }

  // 3. supported locales 순회
  for (const supportedLocale of SUPPORTED_LOCALES) {
    if (supportedLocale !== locale && supportedLocale !== DEFAULT_LOCALE) {
      if (dictionaries[supportedLocale]?.[key] !== undefined) {
        // SAFETY: 대체 locale의 같은 키는 MergedDictionary가 정한 반환 종류를 유지합니다.
        return dictionaries[supportedLocale][key] as SDReturnType<K>;
      }
    }
  }

  // 모든 locale에 값이 없으면 동적으로 조합된 키를 그대로 노출합니다.
  // SAFETY: 누락된 사전 키의 문자열 표현은 LocalizedString fallback 규약을 따릅니다.
  return String(key) as SDReturnType<K>;
}

/**
 * Sonamu Dictionary 함수
 * locale에 맞는 번역 텍스트를 반환합니다.
 *
 * @example
 * SD("common.save")  // → "저장" (LocalizedString)
 * SD("user.notFound")(1)  // → "존재하지 않는 User ID 1" (LocalizedString)
 */
export function SD<K extends DictKey>(key: K): SDReturnType<K> {
  const locale = getCurrentLocale();
  return getDictValue(key, locale);
}

/**
 * 특정 locale의 번역 텍스트를 반환하는 함수를 생성합니다.
 *
 * @example
 * const EN = SD.locale("en");
 * EN("common.save")  // → "Save"
 */
SD.locale =
  (locale: (typeof SUPPORTED_LOCALES)[number]) =>
  <K extends DictKey>(key: K): SDReturnType<K> => {
    return getDictValue(key, locale);
  };

// Localized 가능한 Column 타입 계산
type LocalizedBaseColumn<T> = {
  [K in keyof T & string]: K extends `${infer Base}_${(typeof SUPPORTED_LOCALES)[number]}`
    ? Base
    : K;
}[keyof T & string];

/**
 * locale에 따라 적절한 컬럼 값을 반환합니다.
 * DB에 name, name_ko, name_en처럼 localized column이 있을 때 사용합니다.
 *
 * 우선순위 (지원 로케일은 ko/jp/en이고, 서비스의 기본 로케일은 ko, 사용자의 로케일은 jp일 때): column_jp → column → column_ko → column_en
 * 우선순위 (지원 로케일은 ko/jp/en이고, 서비스의 기본 로케일은 en, 사용자의 로케일은 ko일 때): column_ko → column → column_en → column_jp
 *
 * @example
 * localizedColumn(tag, "name")
 */
type LocalizedColumnScalarValue = string | number | boolean | bigint;
type LocalizedColumnValue = string | string[];
type NestedLocalizedColumnValueFrom<V> = V extends string
  ? string
  : V extends readonly string[]
    ? string[]
    : never;
type LocalizedColumnValueFrom<V> = V extends string
  ? string
  : V extends readonly string[]
    ? string[]
    : V extends number | boolean | bigint
      ? string
      : V extends Partial<Record<(typeof SUPPORTED_LOCALES)[number], infer LV>>
        ? NestedLocalizedColumnValueFrom<LV>
        : never;
type LocalizedColumnCandidate<T, K extends string> =
  | (K extends keyof T ? T[K] : never)
  | {
      [L in (typeof SUPPORTED_LOCALES)[number]]: `${K}_${L}` extends keyof T
        ? T[`${K}_${L}`]
        : never;
    }[(typeof SUPPORTED_LOCALES)[number]];
type LocalizedColumnReturn<T, K extends string> =
  | LocalizedColumnValueFrom<LocalizedColumnCandidate<T, K>>
  | undefined;
type LocaleValueMap = {
  [L in (typeof SUPPORTED_LOCALES)[number]]?: LocalizedColumnValue;
};
function isString<V>(value: V): value is V & string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isLocalizedColumnValue<V>(value: V): value is V & LocalizedColumnValue {
  return isString(value) || (Array.isArray(value) && value.every(isString));
}

function isLocalizedColumnScalarValue<V>(value: V): value is V & LocalizedColumnScalarValue {
  return ["[object String]", "[object Number]", "[object Boolean]", "[object BigInt]"].includes(
    Object.prototype.toString.call(value),
  );
}

function isEmptyLocalizedColumnValue<V>(value: V): value is V & (null | undefined | "") {
  return value === null || value === undefined || value === "";
}

type PropertyValue<T, K extends PropertyKey> = K extends keyof T ? T[K] : undefined;

function getProperty<T extends object, K extends PropertyKey>(row: T, key: K): PropertyValue<T, K> {
  if (!(key in row)) {
    // SAFETY: 존재하지 않는 후보 키는 조건부 속성 타입에서도 undefined입니다.
    return undefined as PropertyValue<T, K>;
  }

  // SAFETY: own/inherited 키 존재를 확인했으므로 해당 키의 조건부 속성 타입으로 좁힐 수 있습니다.
  return (row as T & Record<K, PropertyValue<T, K>>)[key];
}

function getNestedLocaleValue<T extends object, K extends LocalizedBaseColumn<T>>(
  row: T,
  column: K,
  locale: (typeof SUPPORTED_LOCALES)[number],
): LocalizedColumnValue | undefined {
  const columnValue = getProperty(row, column);
  if (columnValue === null || Object.prototype.toString.call(columnValue) !== "[object Object]") {
    return undefined;
  }

  // SAFETY: 일반 객체 검사를 통과한 값만 locale별 값 맵으로 조회합니다.
  return (columnValue as LocaleValueMap)[locale];
}

function localizedKey<K extends string>(
  columnName: K,
  localeName: (typeof SUPPORTED_LOCALES)[number],
) {
  return `${columnName}_${localeName}`;
}

export function localizedColumn<T extends object, K extends LocalizedBaseColumn<T>>(
  row: T,
  column: K,
): LocalizedColumnReturn<T, K> {
  const requestedLocale = getCurrentLocale();
  const locale = SUPPORTED_LOCALES.includes(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const otherLocales = SUPPORTED_LOCALES.filter(
    (candidateLocale) => candidateLocale !== locale && candidateLocale !== DEFAULT_LOCALE,
  );
  const values = [
    { value: getProperty(row, localizedKey(column, locale)), source: "direct" },
    { value: getNestedLocaleValue(row, column, locale), source: "nested" },
    { value: getProperty(row, column), source: "direct" },
    { value: getProperty(row, localizedKey(column, DEFAULT_LOCALE)), source: "direct" },
    { value: getNestedLocaleValue(row, column, DEFAULT_LOCALE), source: "nested" },
    ...otherLocales.flatMap((l) => [
      { value: getProperty(row, localizedKey(column, l)), source: "direct" },
      { value: getNestedLocaleValue(row, column, l), source: "nested" },
    ]),
  ];

  for (const { value, source } of values) {
    if (!isEmptyLocalizedColumnValue(value) && isLocalizedColumnValue(value)) {
      // SAFETY: 값 가드가 선택한 컬럼의 문자열 또는 문자열 배열임을 확인했습니다.
      return value as LocalizedColumnReturn<T, K>;
    }
    if (
      source === "direct" &&
      !isEmptyLocalizedColumnValue(value) &&
      isLocalizedColumnScalarValue(value)
    ) {
      // SAFETY: 직접 컬럼의 스칼라 값은 문자열로 변환해 지역화 반환 타입을 충족합니다.
      return String(value) as LocalizedColumnReturn<T, K>;
    }
  }

  return undefined;
}

/**
 * Enum의 localized labels를 Proxy로 반환합니다.
 * Select 컴포넌트 등에서 EnumLabel[key] 대신 사용합니다.
 *
 * @example
 * SD.enumLabels("TagOrderBy")[key]  // → 현재 locale의 라벨
 */
interface EnumLabels {
  [key: string]: LocalizedString;
}

SD.enumLabels = (enumName: string): EnumLabels => {
  return new Proxy<EnumLabels>(
    {},
    {
      get(_, key: string | symbol) {
        if (Object.prototype.toString.call(key) === "[object Symbol]") {
          return undefined;
        }

        // SAFETY: 생성된 enum 이름과 값의 조합은 enum 사전 키 형식을 따릅니다.
        const dictKey = `enum.${enumName}.${String(key)}` as DictKey;
        return getDictValue(dictKey, getCurrentLocale());
      },
    },
  );
};
