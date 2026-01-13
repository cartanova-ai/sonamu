import { Sonamu } from "sonamu";
import { createFormat, josa, plural } from "sonamu/dict";
import { bootstrap, runWithContext } from "sonamu/test";
import { describe, expect, test, vi } from "vitest";
import { localizedColumn, SD } from "../i18n/sd.generated";

bootstrap(vi);
describe("i18n", () => {
  describe("localizedColumn", () => {
    const tag = {
      name: "test",
      name_ko: "test_ko",
      name_en: "test_en",
    };

    test("ko locale인 경우, name_ko 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test_ko");
        },
      );
    });

    test("en locale인 경우, name_en 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test_en");
        },
      );
    });

    test("unknown locale인 경우, name 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ja",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test");
        },
      );
    });
  });

  describe("SD.enumLabels", () => {
    test("ko locale인 경우, 한국어 라벨 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          const labels = SD.enumLabels("TagOrderBy");
          expect(labels["id-desc"]).toBe("ID최신순");
        },
      );
    });

    test("en locale인 경우, 영어 라벨 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          const labels = SD.enumLabels("TagOrderBy");
          expect(labels["id-desc"]).toBe("ID Descending");
        },
      );
    });
  });

  describe("plural", () => {
    test("n이 0일 때 zero 반환", () => {
      const result = plural(0, { zero: "없음", one: "1개", other: "여러 개" });
      expect(result).toBe("없음");
    });

    test("n이 1일 때 one 반환", () => {
      const result = plural(1, { zero: "없음", one: "1개", other: "여러 개" });
      expect(result).toBe("1개");
    });

    test("n이 2 이상일 때 other 반환", () => {
      const result = plural(5, { zero: "없음", one: "1개", other: "여러 개" });
      expect(result).toBe("여러 개");
    });

    test("other가 함수일 때 n을 전달하여 호출", () => {
      const result = plural(5, { other: (n) => `${n}개` });
      expect(result).toBe("5개");
    });

    test("zero가 없으면 other로 폴백", () => {
      const result = plural(0, { other: "기본값" });
      expect(result).toBe("기본값");
    });

    test("one이 없으면 other로 폴백", () => {
      const result = plural(1, { other: "기본값" });
      expect(result).toBe("기본값");
    });

    test("아무것도 없으면 n.toString() 반환", () => {
      const result = plural(42, {});
      expect(result).toBe("42");
    });
  });

  describe("createFormat", () => {
    test("number 포맷팅", () => {
      const format = createFormat("ko");
      expect(format.number(1234567)).toBe("1,234,567");
    });

    test("date 포맷팅 (ko-KR)", () => {
      const format = createFormat("ko");
      const date = new Date("2024-01-15");
      expect(format.date(date)).toMatch(/2024.*1.*15/);
    });

    test("date 포맷팅 (en-US)", () => {
      const format = createFormat("en");
      const date = new Date("2024-01-15");
      expect(format.date(date)).toMatch(/1.*15.*2024/);
    });
  });

  describe("josa", () => {
    test("받침 있는 단어 + 은/는", () => {
      expect(josa("사람", "은는")).toBe("사람은");
      expect(josa("책", "은는")).toBe("책은");
    });

    test("받침 없는 단어 + 은/는", () => {
      expect(josa("나", "은는")).toBe("나는");
      expect(josa("우리", "은는")).toBe("우리는");
    });

    test("받침 있는 단어 + 이/가", () => {
      expect(josa("물", "이가")).toBe("물이");
    });

    test("받침 없는 단어 + 이/가", () => {
      expect(josa("바다", "이가")).toBe("바다가");
    });

    test("받침 있는 단어 + 을/를", () => {
      expect(josa("밥", "을를")).toBe("밥을");
    });

    test("받침 없는 단어 + 을/를", () => {
      expect(josa("커피", "을를")).toBe("커피를");
    });

    test("받침 있는 단어 + 과/와", () => {
      expect(josa("빵", "과와")).toBe("빵과");
    });

    test("받침 없는 단어 + 과/와", () => {
      expect(josa("우유", "과와")).toBe("우유와");
    });

    test("받침 있는 단어 + 으로/로", () => {
      expect(josa("집", "으로")).toBe("집으로");
    });

    test("받침 없는 단어 + 으로/로", () => {
      expect(josa("학교", "으로")).toBe("학교로");
    });

    test("한글이 아닌 문자는 받침 없음으로 처리", () => {
      expect(josa("ABC", "은는")).toBe("ABC는");
      expect(josa("123", "이가")).toBe("123가");
    });
  });
});
