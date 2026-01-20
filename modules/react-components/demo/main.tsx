/** biome-ignore-all lint/suspicious/noExplicitAny: any is used to make the type distributive */
import ReactDOM from "react-dom/client";
import App from "./App";
import "../src/styles/globals.css";
import { type SonamuFile, SonamuProvider } from "../src/contexts";

// 간단한 dictionary
const simpleDictionary: Record<string, string | ((...args: any[]) => string)> = {
  // Calendar
  "component.calendar.month.0": "1월",
  "component.calendar.month.1": "2월",
  "component.calendar.month.2": "3월",
  "component.calendar.month.3": "4월",
  "component.calendar.month.4": "5월",
  "component.calendar.month.5": "6월",
  "component.calendar.month.6": "7월",
  "component.calendar.month.7": "8월",
  "component.calendar.month.8": "9월",
  "component.calendar.month.9": "10월",
  "component.calendar.month.10": "11월",
  "component.calendar.month.11": "12월",

  // Pagination
  "component.pagination.showing": (start: number, end: number, total: number) =>
    `${total}개 중 ${start}-${end} 표시`,
  "component.pagination.previous": "이전",
  "component.pagination.next": "다음",

  // MultiSelect
  "component.multiSelect.selectPlaceholder": "선택하세요",
  "component.multiSelect.noResults": "결과가 없습니다",
  "component.multiSelect.noOptions": "옵션이 없습니다",
  "component.multiSelect.selectAll": "전체 선택",
  "component.multiSelect.clear": "전체 해제",
  "component.multiSelect.close": "닫기",

  // MonthPickerMultiple
  "component.monthPickerMultiple.placeholder": "월 선택",
  "component.monthPickerMultiple.singleDate": "단일",
  "component.monthPickerMultiple.dateRange": "기간",
  "component.monthPickerMultiple.startDate": "시작일",
  "component.monthPickerMultiple.endDate": "종료일",
  "component.monthPickerMultiple.addMonth": "월 추가",

  // DateSelectorMultiple
  "component.dateSelectorMultiple.singleDate": "단일",
  "component.dateSelectorMultiple.dateRange": "기간",

  // Combobox
  "component.combobox.selectPlaceholder": "선택하세요",
  "component.combobox.noResults": "결과가 없습니다",

  // FileInput
  "component.fileInput.imagePlaceholder": "이미지",
  "component.fileInput.filePlaceholder": "파일",
  "component.fileInput.maxFilesExceeded": (maxFiles: number) =>
    `최대 ${maxFiles}개까지만 업로드할 수 있습니다`,
  "component.fileInput.uploadFailed": "업로드에 실패했습니다",
  "component.fileInput.uploading": "업로드 중...",
  "component.fileInput.pending": "대기중",

  // Common
  "common.cancel": "취소",
  "common.save": "저장",
  "common.searchPlaceholder": "검색...",
};

// SD 함수 구현
const SD = (key: string): any => simpleDictionary[key] || key;

// Mock uploader 함수
const mockUploader = async (files: File[]): Promise<SonamuFile[]> => {
  return files.map((file) => ({
    name: file.name,
    url: URL.createObjectURL(file),
    mime_type: file.type,
    size: file.size,
  }));
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <SonamuProvider SD={SD} uploader={mockUploader}>
    <App />
  </SonamuProvider>,
);
