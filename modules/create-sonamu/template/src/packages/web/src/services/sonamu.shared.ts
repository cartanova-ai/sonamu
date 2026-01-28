// 자동 생성 파일 - sonamu sync로 갱신됨
// 초기 빈 상태 - sonamu dev 실행 시 실제 내용으로 대체됩니다.

/**
 * ISO 8601 및 타임존 포맷의 날짜 문자열을 Date 객체로 변환하는 reviver
 */
export function dateReviver(_key: string, value: any): any {
  if (typeof value === "string") {
    // ISO 8601 형식: 2024-01-15T09:30:00.000Z 또는 2024-01-15T09:30:00+09:00
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
    // Timezone 포맷: 2024-01-15 09:30:00+09:00
    const timezoneRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

    if (
      (isoRegex.test(value) || timezoneRegex.test(value)) &&
      new Date(value).toString() !== "Invalid Date"
    ) {
      return new Date(value);
    }
  }
  return value;
}
