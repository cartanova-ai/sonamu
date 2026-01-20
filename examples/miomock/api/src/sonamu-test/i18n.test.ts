/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: template 테스트 시 사용 */
import { Sonamu } from "sonamu";
import { createFormat, type DictEntry, josa, plural, sonamuDictionary } from "sonamu/dict";
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

    const tagWithoutDefaultName = {
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
});
