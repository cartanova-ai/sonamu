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
const entityLabels = {} as const;

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
