import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { centerText } from "../../../../../modules/sonamu/dist/utils/console-util";

describe("console-util", () => {
  let originalColumns: number | undefined;

  beforeEach(() => {
    // 원래 터미널 너비 저장
    originalColumns = process.stdout.columns;
    // 터미널 너비를 80으로 고정
    Object.defineProperty(process.stdout, "columns", {
      value: 80,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // 원래 터미널 너비 복원
    Object.defineProperty(process.stdout, "columns", {
      value: originalColumns,
      writable: true,
      configurable: true,
    });
  });

  describe("centerText", () => {
    test("텍스트를 터미널 중앙에 정렬한다", () => {
      const text = "Hello";
      const result = centerText(text);

      // 터미널 너비 80, 텍스트 길이 5
      // 좌우 여백: (80 - 5) / 2 = 37.5
      // repeat()는 소수점을 버리므로 실제로는 37칸씩
      const margin = Math.floor((80 - text.length) / 2);
      const expectedLength = margin * 2 + text.length;

      expect(result).toContain(text);
      expect(result.length).toBe(expectedLength); // 37 + 5 + 37 = 79
    });

    test("실제 사용 예시: Syncer 성공 메시지", () => {
      const text = "All files are synced!";
      const result = centerText(text);

      // 텍스트가 중앙에 위치하는지 확인
      expect(result).toContain(text);

      // 좌우 여백이 균등한지 확인
      const leftMargin = result.indexOf(text);
      const rightMargin = result.length - (leftMargin + text.length);
      expect(leftMargin).toBe(rightMargin);
    });

    test("실제 사용 예시: HMR 완료 메시지", () => {
      const text = "HMR Done! 123ms";
      const result = centerText(text);

      // 텍스트가 중앙에 위치하는지 확인
      expect(result).toContain(text);

      // 좌우 여백이 균등한지 확인
      const leftMargin = result.indexOf(text);
      const rightMargin = result.length - (leftMargin + text.length);
      expect(leftMargin).toBe(rightMargin);
    });
  });
});
