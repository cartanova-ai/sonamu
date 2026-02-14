/**
 * @generated
 * 직접 수정하지 마세요.
 */

const DEFAULT_LOCALE = "ko" as const;
export const SUPPORTED_LOCALES = ["ko", "en", "ja"] as const;
let _currentLocale: (typeof SUPPORTED_LOCALES)[number] = DEFAULT_LOCALE;

export function setLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
  _currentLocale = locale;
}

export function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  return _currentLocale;
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
const dictionaries: Record<string, Partial<MergedDictionary>> = {
  ko: { ...rcKeysKo, ...entityLabels, ...ko },
  en: { ...rcKeysEn, ...en },
  ja: { ...rcKeysKo, ...ja },
};

type SDReturnType<K extends DictKey> = MergedDictionary[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  // 1. 지정된 locale에서 조회
  const dict = dictionaries[locale];
  if (dict?.[key] !== undefined) {
    return dict[key] as unknown as SDReturnType<K>;
  }

  // 2. default locale에서 조회
  if (locale !== DEFAULT_LOCALE && dictionaries[DEFAULT_LOCALE]?.[key] !== undefined) {
    return dictionaries[DEFAULT_LOCALE][key] as unknown as SDReturnType<K>;
  }

  // 3. supported locales 순회
  for (const supportedLocale of SUPPORTED_LOCALES) {
    if (supportedLocale !== locale && supportedLocale !== DEFAULT_LOCALE) {
      if (dictionaries[supportedLocale]?.[key] !== undefined) {
        return dictionaries[supportedLocale][key] as unknown as SDReturnType<K>;
      }
    }
  }

  // 4. 모두 실패 시 key 반환
  return key as unknown as SDReturnType<K>;
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
export function localizedColumn<
  T extends Record<string, unknown>,
  K extends LocalizedBaseColumn<T>,
>(row: T, column: K): string | undefined {
  const locale = getCurrentLocale();
  const otherLocales = SUPPORTED_LOCALES.filter(
    (l: string) => l !== locale && l !== DEFAULT_LOCALE,
  );
  const localizedKey = (column: K, locale: (typeof SUPPORTED_LOCALES)[number]) =>
    `${column}_${locale}`;
  const keys = [
    localizedKey(column, locale),
    column,
    localizedKey(column, DEFAULT_LOCALE),
    ...otherLocales.map((l) => localizedKey(column, l)),
  ];

  for (const key of keys) {
    if (!(key in row)) {
      continue;
    }

    if (row[key] !== null && row[key] !== undefined && row[key] !== "") {
      return String(row[key]);
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
SD.enumLabels = (enumName: string): Record<string, LocalizedString> => {
  return new Proxy({} as Record<string, LocalizedString>, {
    get(_, key: string) {
      const dictKey = `enum.${enumName}.${key}` as DictKey;
      return getDictValue(dictKey, getCurrentLocale());
    },
  });
};
