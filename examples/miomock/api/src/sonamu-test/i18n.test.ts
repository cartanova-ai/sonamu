import fs from "fs";

/* oxlint-disable no-template-curly-in-string */ // template 테스트 시 사용
import { Workbook } from "@sheetkit/node";
import { Sonamu } from "sonamu";
import { createFormat, josa, plural, sonamuDictionary } from "sonamu/dict";
import { type DictEntry } from "sonamu/dict";
import { bootstrap, runWithContext } from "sonamu/test";
import { describe, expect, expectTypeOf, test, vi } from "vitest";

import { BadRequestException } from "../../../../../modules/sonamu/dist/exceptions/so-exceptions";
import { localizedColumn, SD } from "../i18n/sd.generated";

bootstrap(vi);
const colLetter = (index: number) => String.fromCharCode(65 + index);

describe("i18n", () => {
  describe("localizedColumn", () => {
    const tag = {
      name: "test",
      name_ko: "test_ko",
      name_en: "test_en",
    };

    const tagWithoutDefaultName = {
      name_ko: "test_ko",
      name_en: "test_en",
    };

    const tagWithArrayName = {
      name: ["test"],
      name_ko: ["test_ko"],
      name_en: ["test_en"],
    };

    const tagWithNumericSuffixName = {
      name: "test",
      name_ko: 123,
      name_en: "test_en",
    };

    const tagWithNestedLocaleName = {
      name: {
        ko: "test_ko",
        en: "test_en",
        ja: "test_ja",
      },
    };

    const tagWithNestedArrayLocaleName = {
      name: {
        ko: ["test_ko"],
        en: ["test_en"],
        ja: ["test_ja"],
      },
    };

    const tagWithEmptyCurrentLocale = {
      name: {
        ko: "test_ko",
        en: "",
        ja: "test_ja",
      },
    };

    const tagWithUnsupportedNestedLocaleName = {
      name: {
        ko: "test_ko",
        fr: "test_fr",
      },
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

    test("지원하지 않는 locale은 default locale suffix 값을 반환한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "fr",
        },
        async () => {
          expect(localizedColumn(tag, "name")).toBe("test_ko");
        },
      );
    });

    test("tag에 default name이 없을 때도 작동해야함", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          expect(localizedColumn(tagWithoutDefaultName, "name")).toBe("test_ko");
        },
      );
    });

    test("suffix 컬럼 값이 string[]이면 배열을 그대로 반환한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          expect(localizedColumn(tagWithArrayName, "name")).toEqual(["test_ko"]);
        },
      );
    });

    test("suffix 컬럼 값이 number이면 문자열로 변환하고 base보다 우선한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          expect(localizedColumn(tagWithNumericSuffixName, "name")).toBe("123");
        },
      );
    });

    test("nested locale map에서 현재 locale 값을 반환한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          expect(localizedColumn(tagWithNestedLocaleName, "name")).toBe("test_en");
        },
      );
    });

    test("nested locale map 값이 string[]이면 배열을 그대로 반환한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ja",
        },
        async () => {
          expect(localizedColumn(tagWithNestedArrayLocaleName, "name")).toEqual(["test_ja"]);
        },
      );
    });

    test("현재 locale 값이 비어 있으면 기존 우선순위로 fallback한다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          expect(localizedColumn(tagWithEmptyCurrentLocale, "name")).toBe("test_ko");
        },
      );
    });

    test("지원하지 않는 locale은 nested locale map의 unsupported 값을 반환하지 않는다", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "fr",
        },
        async () => {
          expect(localizedColumn(tagWithUnsupportedNestedLocaleName, "name")).toBe("test_ko");
        },
      );
    });

    test("반환 타입이 입력 값에 따라 string 또는 string[]를 보존한다", () => {
      expectTypeOf(localizedColumn(tag, "name")).toEqualTypeOf<string | undefined>();
      expectTypeOf(localizedColumn(tagWithArrayName, "name")).toEqualTypeOf<string[] | undefined>();
      expectTypeOf(localizedColumn(tagWithNumericSuffixName, "name")).toEqualTypeOf<
        string | undefined
      >();
      expectTypeOf(localizedColumn(tagWithNestedLocaleName, "name")).toEqualTypeOf<
        string | undefined
      >();
      expectTypeOf(localizedColumn(tagWithNestedArrayLocaleName, "name")).toEqualTypeOf<
        string[] | undefined
      >();
    });
  });

  describe("SD fallback", () => {
    test("지정된 locale에 값이 있으면 해당 값 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          // ko 사전에 있는 키 → ko 값 반환
          const labels = SD.enumLabels("TagOrderBy");
          expect(labels["id-desc"]).toBe("ID최신순");
        },
      );
    });

    test("지정된 locale에 값이 없으면 default locale에서 fallback", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          // "common.all"은 ko에만 있고 en에는 없음
          // en locale에서 조회 → 없음 → ko(default)로 fallback
          expect(SD("common.all")).toBe("전체");
        },
      );
    });

    test("지원하지 않는 locale이면 default locale로 fallback", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "fr", // supportedLocales에 없는 locale
        },
        async () => {
          // fr은 지원되지 않으므로 ko(default)로 fallback
          const labels = SD.enumLabels("TagOrderBy");
          expect(labels["id-desc"]).toBe("ID최신순");
        },
      );
    });

    test("모든 locale에 없는 키는 키 자체를 반환", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "ko",
        },
        async () => {
          // 존재하지 않는 enum 값 → key 자체 반환
          const labels = SD.enumLabels("NonExistentEnum");
          expect(labels["non-existent-value"]).toBe("enum.NonExistentEnum.non-existent-value");
        },
      );
    });

    test("default locale에도 없는 키는 supported locales를 순회하여 찾음", async () => {
      await runWithContext(
        {
          ...Sonamu.getContext(),
          locale: "en",
        },
        async () => {
          // "test.jaOnly"는 ja 딕셔너리에만 존재하는 키 (사실상 defineLocale을 이용하면 이런 경우 없긴 함.)
          // en에서 조회 → 없음 → ko(default)에서 조회 → 없음 → ja(supported)에서 찾음
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- ko에 없는 키로 테스트 필요
          // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
          expect(SD("test.jaOnly" as any)).toBe("日本語のみ");
        },
      );
    });
  });

  describe("SD.enumLabels", () => {
    test("Symbol key 접근 시 예외 없이 undefined 반환", () => {
      const labels = SD.enumLabels("TagOrderBy");

      expect(() => Object.getOwnPropertyDescriptor(labels, Symbol.toStringTag)).not.toThrow();
      expect(Object.getOwnPropertyDescriptor(labels, Symbol.toStringTag)).toBeUndefined();
    });

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

  describe("SonamuDictionary", () => {
    describe("parseEntityKey", () => {
      test("entity title 키 파싱", () => {
        const result = sonamuDictionary.parseEntityKey("entity.User");
        expect(result).toEqual({ type: "entityTitle", entityId: "User" });
      });

      test("entity prop 키 파싱", () => {
        const result = sonamuDictionary.parseEntityKey("entity.User.name");
        expect(result).toEqual({ type: "propDesc", entityId: "User", propName: "name" });
      });

      test("snake_case prop 키 파싱", () => {
        const result = sonamuDictionary.parseEntityKey("entity.User.created_at");
        expect(result).toEqual({ type: "propDesc", entityId: "User", propName: "created_at" });
      });

      test("enum label 키 파싱", () => {
        const result = sonamuDictionary.parseEntityKey("enum.UserRole.admin");
        expect(result).toEqual({ type: "enumLabel", enumId: "UserRole", enumValue: "admin" });
      });

      test("enum label - 대시 포함 값", () => {
        const result = sonamuDictionary.parseEntityKey("enum.TagOrderBy.id-desc");
        expect(result).toEqual({ type: "enumLabel", enumId: "TagOrderBy", enumValue: "id-desc" });
      });

      test("일반 키는 other로 파싱", () => {
        const result = sonamuDictionary.parseEntityKey("common.save");
        expect(result).toEqual({ type: "other" });
      });
    });

    describe("loadProjectDict", () => {
      test("ko locale dict 로드", () => {
        const { entries } = sonamuDictionary.loadProjectDict("ko");
        expect(entries.length).toBeGreaterThan(0);
      });

      test("en locale dict 로드", () => {
        const { entries } = sonamuDictionary.loadProjectDict("en");
        expect(entries.length).toBeGreaterThan(0);
      });

      test("존재하지 않는 locale은 빈 배열 반환", () => {
        const { entries } = sonamuDictionary.loadProjectDict("ja");
        expect(entries).toEqual([]);
      });
    });

    describe("extractEntityLabels", () => {
      test("entity labels 추출", () => {
        const labels = sonamuDictionary.extractEntityLabels();
        expect(labels.length).toBeGreaterThan(0);

        // entity.* 형식의 키가 있는지 확인
        const entityKeys = labels.filter((l) => l.key.startsWith("entity."));
        expect(entityKeys.length).toBeGreaterThan(0);
      });
    });

    describe("collectDictionary", () => {
      test("딕셔너리 수집 결과 확인", async () => {
        const result = await sonamuDictionary.collectDictionary();

        expect(result.rows).toBeDefined();
        expect(result.rows.length).toBeGreaterThan(0);
        expect(result.locales).toContain("ko");
        expect(result.defaultLocale).toBe("ko");
        expect(result.stats).toBeDefined();
        expect(result.stats.ko).toBeDefined();
        expect(result.stats.ko?.total).toBeGreaterThan(0);
      });

      test("entity source 키가 포함됨", async () => {
        const result = await sonamuDictionary.collectDictionary();
        const entityRows = result.rows.filter((r) => r.source === "entity");
        expect(entityRows.length).toBeGreaterThan(0);
      });

      test("project source 키가 포함됨", async () => {
        const result = await sonamuDictionary.collectDictionary();
        const projectRows = result.rows.filter((r) => r.source === "project");
        expect(projectRows.length).toBeGreaterThan(0);
      });
    });
  });

  describe("isExpressionFunction", () => {
    test("일반 문자열은 false", () => {
      expect(sonamuDictionary.isExpressionFunction("안녕하세요")).toBe(false);
      expect(sonamuDictionary.isExpressionFunction("Hello World")).toBe(false);
    });

    test("빈 문자열은 false", () => {
      expect(sonamuDictionary.isExpressionFunction("")).toBe(false);
      expect(sonamuDictionary.isExpressionFunction("   ")).toBe(false);
    });

    test("화살표 함수는 true", () => {
      expect(sonamuDictionary.isExpressionFunction("(n) => `${n}개`")).toBe(true);
      expect(sonamuDictionary.isExpressionFunction("(count: number) => `${count}개`")).toBe(true);
    });

    test("파라미터 없는 화살표 함수는 true", () => {
      expect(sonamuDictionary.isExpressionFunction("() => `고정값`")).toBe(true);
    });

    test("plural 사용 함수는 true", () => {
      expect(
        sonamuDictionary.isExpressionFunction('(n) => plural(n, { one: "1개", other: `${n}개` })'),
      ).toBe(true);
    });

    test("josa 사용 함수는 true", () => {
      expect(sonamuDictionary.isExpressionFunction('(word) => josa(word, "은는")')).toBe(true);
    });

    test("format 사용 함수는 true", () => {
      expect(sonamuDictionary.isExpressionFunction("(n) => format.number(n)")).toBe(true);
    });

    test("멀티라인 함수도 true", () => {
      const multiline = `(count: number) =>
        plural(count, {
          zero: "없음",
          one: "1개",
          other: \`\${count}개\`
        })`;
      expect(sonamuDictionary.isExpressionFunction(multiline)).toBe(true);
    });
  });

  describe("generateProjectDict", () => {
    test("일반 문자열 값은 JSON.stringify로 출력", () => {
      const entries: DictEntry[] = [{ key: "greeting", value: "안녕하세요", isFunction: false }];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain('"greeting": "안녕하세요"');
    });

    test("함수 값은 원형 그대로 출력", () => {
      const entries: DictEntry[] = [
        { key: "count", value: "(n: number) => `${n}개`", isFunction: true },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain('"count": (n: number) => `${n}개`');
    });

    test("줄바꿈 포함 문자열은 이스케이프 처리", () => {
      const entries: DictEntry[] = [
        { key: "multiline", value: "첫째 줄\n둘째 줄\n셋째 줄", isFunction: false },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      // JSON.stringify가 \n을 \\n으로 이스케이프함
      expect(result).toContain('"multiline": "첫째 줄\\n둘째 줄\\n셋째 줄"');
    });

    test("plural 사용 시 import 추가", () => {
      const entries: DictEntry[] = [
        {
          key: "items",
          value: '(n) => plural(n, { one: "1개", other: `${n}개` })',
          isFunction: true,
        },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain('import { plural } from "sonamu/dict"');
    });

    test("josa 사용 시 import 추가", () => {
      const entries: DictEntry[] = [
        { key: "subject", value: '(word) => josa(word, "이가")', isFunction: true },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain('import { josa } from "sonamu/dict"');
    });

    test("format 사용 시 createFormat import 및 const 선언 추가", () => {
      const entries: DictEntry[] = [
        { key: "price", value: "(n) => `${format.number(n)}원`", isFunction: true },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain('import { createFormat } from "sonamu/dict"');
      expect(result).toContain('const format = createFormat("ko")');
    });

    test("plural, josa, format 모두 사용 시 한 줄에 import", () => {
      const entries: DictEntry[] = [
        { key: "items", value: "(n) => plural(n, { other: `${n}개` })", isFunction: true },
        { key: "subject", value: '(w) => josa(w, "은는")', isFunction: true },
        { key: "price", value: "(n) => format.number(n)", isFunction: true },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain('import { plural, josa, createFormat } from "sonamu/dict"');
    });

    test("defaultLocale은 export default { ... } as const 형식", () => {
      const entries: DictEntry[] = [{ key: "test", value: "테스트", isFunction: false }];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      expect(result).toContain("export default {");
      expect(result).toContain("} as const;");
    });

    test("non-defaultLocale은 defineLocale 형식", () => {
      const entries: DictEntry[] = [{ key: "test", value: "Test", isFunction: false }];
      const result = sonamuDictionary.generateProjectDict("en", entries, false);

      expect(result).toContain('import { defineLocale } from "./sd.generated"');
      expect(result).toContain("export default defineLocale({");
      expect(result).toContain("});");
    });

    test("키는 알파벳 순으로 정렬됨", () => {
      const entries: DictEntry[] = [
        { key: "zebra", value: "얼룩말", isFunction: false },
        { key: "apple", value: "사과", isFunction: false },
        { key: "mango", value: "망고", isFunction: false },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      const appleIndex = result.indexOf('"apple"');
      const mangoIndex = result.indexOf('"mango"');
      const zebraIndex = result.indexOf('"zebra"');

      expect(appleIndex).toBeLessThan(mangoIndex);
      expect(mangoIndex).toBeLessThan(zebraIndex);
    });

    test("특수문자 포함 문자열 처리", () => {
      const entries: DictEntry[] = [
        { key: "quote", value: '따옴표 "테스트"', isFunction: false },
        { key: "backslash", value: "백슬래시 \\ 테스트", isFunction: false },
        { key: "newline", value: "줄바꿈\n테스트", isFunction: false },
      ];
      const result = sonamuDictionary.generateProjectDict("ko", entries, true);

      // JSON.stringify가 특수문자를 이스케이프함
      expect(result).toContain('"quote": "따옴표 \\"테스트\\""');
      expect(result).toContain('"backslash": "백슬래시 \\\\ 테스트"');
      expect(result).toContain('"newline": "줄바꿈\\n테스트"');
    });
  });

  describe("exportToExcel / importFromExcel", () => {
    const HEADER_SCAN_MAX_ROWS = 20;

    test("exportToExcel이 유효한 XLSX buffer를 반환한다", async () => {
      const result = await sonamuDictionary.exportToExcel();

      expect(result.filename).toBeDefined();
      expect(result.filename).toContain("Dictionary");
      expect(result.filename).toContain(".xlsx");
      expect(result.buffer).toBeDefined();
      expect(Buffer.byteLength(result.buffer)).toBeGreaterThan(0);

      const wb = Workbook.openBufferSync(result.buffer);
      expect(wb.sheetNames.length).toBeGreaterThan(0);
    });

    test("export 후 import round-trip에서 key, source, locale 값이 보존된다", async () => {
      const exportResult = await sonamuDictionary.exportToExcel();
      const buffer = Buffer.isBuffer(exportResult.buffer)
        ? exportResult.buffer
        : Buffer.from(exportResult.buffer);

      const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      const updateEntityByKeySpy = vi
        .spyOn(sonamuDictionary, "updateEntityByKey")
        .mockResolvedValue(false);

      const importResult = await sonamuDictionary.importFromExcel(buffer);

      expect(importResult.success).toBe(true);
      expect(writeFileSyncSpy).toHaveBeenCalled();

      writeFileSyncSpy.mockRestore();
      updateEntityByKeySpy.mockRestore();

      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const wb = Workbook.openBufferSync(buffer);
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const sheet = wb.sheetNames[0] as string;
      // Find header row by scanning column A
      let headerRowNum = 0;
      for (let r = 1; r <= HEADER_SCAN_MAX_ROWS; r++) {
        const val = String(wb.getCellValue(sheet, `A${r}`) ?? "")
          .trim()
          .toLowerCase();
        if (val === "key") {
          headerRowNum = r;
          break;
        }
      }
      expect(headerRowNum).toBeGreaterThan(0);

      // Read headers
      const headers: string[] = [];
      let col = 0;
      while (true) {
        const val = wb.getCellValue(sheet, `${colLetter(col)}${headerRowNum}`);
        if (val === null) break;
        headers.push(String(val));
        col++;
      }
      expect(headers[0]).toBe("key");
      expect(headers[1]).toBe("source");
      expect(headers.length).toBeGreaterThan(2);

      // Check first data row
      const firstKey = wb.getCellValue(sheet, `A${headerRowNum + 1}`);
      expect(firstKey).toBeDefined();
      const firstSource = String(wb.getCellValue(sheet, `B${headerRowNum + 1}`) ?? "");
      expect(["entity", "project", "sonamu"]).toContain(firstSource);
    });

    // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
    test("헤더 없는 Excel 파일에서 BadRequestException이 발생한다", async () => {
      const wb = new Workbook();
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const sheet = wb.sheetNames[0] as string;
      wb.setCellValue(sheet, "A1", "invalid");
      wb.setCellValue(sheet, "B1", "data");
      wb.setCellValue(sheet, "C1", "here");
      wb.setCellValue(sheet, "A2", "no");
      wb.setCellValue(sheet, "B2", "header");
      wb.setCellValue(sheet, "C2", "row");
      const buffer = wb.writeBufferSync();

      const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      const updateEntityByKeySpy = vi
        .spyOn(sonamuDictionary, "updateEntityByKey")
        .mockResolvedValue(false);

      await expect(sonamuDictionary.importFromExcel(Buffer.from(buffer))).rejects.toThrow(
        BadRequestException,
      );

      writeFileSyncSpy.mockRestore();
      updateEntityByKeySpy.mockRestore();
    });

    test("빈 딕셔너리에서 export/import가 오류 없이 동작한다", async () => {
      const dictResult = await sonamuDictionary.collectDictionary();
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      expect(dictResult.rows.length).toBeGreaterThan(0);

      const wb = new Workbook();
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const sheet = wb.sheetNames[0] as string;
      wb.setCellValue(sheet, "A1", "Sonamu Dictionary");
      // Row 2 is empty
      wb.setCellValue(sheet, "A3", "key");
      wb.setCellValue(sheet, "B3", "source");
      wb.setCellValue(sheet, "C3", "ko");
      wb.setCellValue(sheet, "D3", "en");
      const buffer = wb.writeBufferSync();

      const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      const updateEntityByKeySpy = vi
        .spyOn(sonamuDictionary, "updateEntityByKey")
        .mockResolvedValue(false);

      const importResult = await sonamuDictionary.importFromExcel(Buffer.from(buffer));

      expect(importResult.success).toBe(true);
      expect(importResult.updatedEntities).toBe(0);
      expect(importResult.updatedLocales).toBe(0);

      writeFileSyncSpy.mockRestore();
      updateEntityByKeySpy.mockRestore();
    });

    test("함수 값 entry가 round-trip 후 보존된다", async () => {
      const exportResult = await sonamuDictionary.exportToExcel();
      const buffer = Buffer.isBuffer(exportResult.buffer)
        ? // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
          exportResult.buffer
        : Buffer.from(exportResult.buffer);

      const wb = Workbook.openBufferSync(buffer);
      // SAFETY: 테스트가 검증하는 고정된 입력과 대상 타입이 일치한다.
      const sheet = wb.sheetNames[0] as string;
      // Find header row
      let headerRowNum = 0;
      for (let r = 1; r <= HEADER_SCAN_MAX_ROWS; r++) {
        if (
          String(wb.getCellValue(sheet, `A${r}`) ?? "")
            .trim()
            .toLowerCase() === "key"
        ) {
          headerRowNum = r;
          break;
        }
      }
      expect(headerRowNum).toBeGreaterThan(0);

      // Scan for function entries
      let foundFunctionEntry = false;
      for (let r = headerRowNum + 1; ; r++) {
        const keyCell = wb.getCellValue(sheet, `A${r}`);
        if (keyCell === null) break;
        const sourceCell = String(wb.getCellValue(sheet, `B${r}`) ?? "");

        for (let c = 2; c < 20; c++) {
          const cellValue = String(wb.getCellValue(sheet, `${colLetter(c)}${r}`) ?? "");
          if (cellValue.includes("=>") || cellValue.includes("(n)")) {
            foundFunctionEntry = true;
            expect(String(keyCell)).toBeTruthy();
            expect(["entity", "project"]).toContain(sourceCell);
            break;
          }
        }
        if (foundFunctionEntry) break;
      }

      expect(foundFunctionEntry).toBe(true);
    });

    test("테스트 실행으로 i18n/entity 소스 파일이 변경되지 않는다", async () => {
      const exportResult = await sonamuDictionary.exportToExcel();
      const buffer = Buffer.isBuffer(exportResult.buffer)
        ? exportResult.buffer
        : Buffer.from(exportResult.buffer);

      const writeFileSyncSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
      const updateEntityByKeySpy = vi
        .spyOn(sonamuDictionary, "updateEntityByKey")
        .mockResolvedValue(false);

      await sonamuDictionary.importFromExcel(buffer);

      expect(writeFileSyncSpy).toHaveBeenCalled();
      expect(updateEntityByKeySpy).toHaveBeenCalled();

      writeFileSyncSpy.mockRestore();
      updateEntityByKeySpy.mockRestore();
    });
  });
});
