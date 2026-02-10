/**
 * React Components i18n Keys
 *
 * react-components의 i18n 키를 관리하는 Single Source of Truth
 *
 */
export const rcKeysKo = {
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

export type RCKeys = typeof rcKeysKo;
export type RCKeyName = keyof RCKeys;

export const rcKeysEn = {
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
} satisfies RCKeys;
