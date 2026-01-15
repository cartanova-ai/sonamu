const DEFAULT_LOCALE = "ko";
const SUPPORTED_LOCALES = ["ko", "en"];
let _currentLocale = DEFAULT_LOCALE;

export function setLocale(locale: string) {
  _currentLocale = locale;
}

export function getCurrentLocale(): string {
  return _currentLocale;
}

import en from "./en";
import ko from "./ko";

// entity.json에서 추출한 entity labels (defaultLocale 전용)
const entityLabels = {
  "entity.Company": "COMPANY",
  "entity.Company.id": "ID",
  "entity.Company.created_at": "등록일시",
  "entity.Company.name": "회사명",
  "enum.CompanyOrderBy.id-desc": "ID최신순",
  "enum.CompanySearchField.id": "ID",
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
  "entity.File": "FILE",
  "entity.File.id": "ID",
  "entity.File.created_at": "등록일시",
  "entity.File.mime_type": "MIME타입",
  "entity.File.name": "FILE명",
  "entity.File.url": "URL",
  "enum.FileOrderBy.id-desc": "ID최신순",
  "enum.FileSearchField.id": "ID",
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
  "enum.UserOrderBy.id-desc": "ID최신순",
  "enum.UserSearchField.id": "ID",
  "enum.UserRole.normal": "노멀",
  "enum.UserRole.admin": "관리자",
} as const;

// defaultLocale의 dictionary를 기준으로 키 추출
type ProjectDictionary = typeof ko;
type EntityLabels = typeof entityLabels;
type RawMergedDictionary = Omit<EntityLabels, keyof ProjectDictionary> & ProjectDictionary;

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

// 각 locale별로 entity labels + 프로젝트 dict 합침
const dictionaries: Record<string, Partial<MergedDictionary>> = {
  ko: { ...entityLabels, ...ko },
  en: { ...en },
};

type SDReturnType<K extends DictKey> = MergedDictionary[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  const dict = dictionaries[locale];
  const value = dict?.[key] ?? dictionaries[DEFAULT_LOCALE]?.[key] ?? key;
  return value as unknown as SDReturnType<K>;
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
  (locale: string) =>
  <K extends DictKey>(key: K): SDReturnType<K> => {
    return getDictValue(key, locale);
  };

/**
 * locale에 따라 적절한 컬럼 값을 반환합니다.
 * DB에 name, name_ko, name_en처럼 localized column이 있을 때 사용합니다.
 *
 * 우선순위 (ko locale): column_ko → column → column_en
 * 우선순위 (en locale): column_en → column → column_ko
 *
 * @example
 * localizedColumn(tag, "name")
 */
export function localizedColumn<T extends Record<string, unknown>, K extends keyof T & string>(
  row: T,
  column: K,
): string | undefined {
  const locale = getCurrentLocale();
  const otherLocales = SUPPORTED_LOCALES.filter((l: string) => l !== locale);
  const localizedKey = (column: K, locale: string) => `${String(column)}_${locale}`;
  const keys = [
    localizedKey(column, locale),
    column,
    ...otherLocales.map((l) => localizedKey(column, l)),
  ];

  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") {
      return String(value);
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
