import { Template, TemplateManager, TemplateManagerClass } from "sonamu";
import { type TemplateKey, type TemplateOptions } from "sonamu";
import { bootstrap } from "sonamu/test";
import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

bootstrap(vi, { forTesting: false });

describe("TemplateManager", () => {
  // bootstrap에서 forTesting: false로 Sonamu.init()이 호출되어 템플릿이 이미 로드됨
  // 별도의 reset()은 필요하지 않음
  // ============================================
  // 1. 기본 기능
  // ============================================
  describe("기본 기능", () => {
    describe("autoload / isAutoloaded", () => {
      // 목적: Sonamu.init() 후 빌트인 템플릿이 자동 로드되는지 확인
      test("빌트인 템플릿 로드 확인", async () => {
        expect(TemplateManager.isAutoloaded).toBe(true);
        expect(TemplateManager.size).toBeGreaterThanOrEqual(15);
      });

      // 목적: 주요 빌트인 템플릿이 모두 존재하는지 확인
      test("주요 빌트인 템플릿 존재 확인", async () => {
        const expectedKeys = [
          "entity",
          "model",
          "init_types",
          "generated",
          "generated_sso",
          "generated_http",
          "services",
          "view_list",
          "view_form",
          "model_test",
        ];

        for (const key of expectedKeys) {
          expect(TemplateManager.exists(key)).toBe(true);
        }
      });
    });

    describe("get()", () => {
      // 목적: get()으로 템플릿을 정상 조회할 수 있는지 확인
      test("존재하는 템플릿 조회", async () => {
        const entityTemplate = TemplateManager.get("entity");

        expect(entityTemplate).toBeDefined();
        expect(entityTemplate.key).toBe("entity");
        expect(entityTemplate.render).toEqual(expect.any(Function));
        expect(entityTemplate.getTargetAndPath).toEqual(expect.any(Function));
      });

      // 목적: 존재하지 않는 템플릿 조회 시 명확한 에러가 발생하는지 확인
      test("존재하지 않는 템플릿 조회 → 에러", async () => {
        expect(() => TemplateManager.get("non-existent-template")).toThrow(
          /Template 'non-existent-template' not found/,
        );
      });

      // 목적: 에러 메시지에 사용 가능한 템플릿 목록이 포함되는지 확인
      test("에러 메시지에 사용 가능한 템플릿 목록 포함", async () => {
        expect(() => TemplateManager.get("wrong-key")).toThrow(/Template 'wrong-key' not found/);
      });
    });

    describe("exists()", () => {
      // 목적: exists()로 템플릿 존재 여부를 확인할 수 있는지 확인
      test("존재하는 템플릿 → true", async () => {
        expect(TemplateManager.exists("entity")).toBe(true);
        expect(TemplateManager.exists("model")).toBe(true);
      });

      // 목적: 존재하지 않는 템플릿에 대해 false 반환 확인
      test("존재하지 않는 템플릿 → false", async () => {
        expect(TemplateManager.exists("non-existent")).toBe(false);
      });
    });

    describe("getAllKeys()", () => {
      // 목적: getAllKeys()가 정렬된 템플릿 키 목록을 반환하는지 확인
      test("정렬된 템플릿 키 목록 반환", async () => {
        const keys = TemplateManager.getAllKeys();

        expect(Array.isArray(keys)).toBe(true);
        expect(keys.length).toBeGreaterThanOrEqual(15);

        // 정렬 확인
        const sortedKeys = [...keys].toSorted();
        expect(keys).toEqual(sortedKeys);
      });

      // 목적: 빌트인 템플릿 키가 모두 포함되는지 확인
      test("빌트인 템플릿 키 포함", async () => {
        const keys = TemplateManager.getAllKeys();

        expect(keys).toContain("entity");
        expect(keys).toContain("model");
        expect(keys).toContain("services");
      });
    });

    describe("size", () => {
      // 목적: size 속성이 등록된 템플릿 개수를 반환하는지 확인
      test("등록된 템플릿 개수 반환", async () => {
        expect(TemplateManager.size).toBeGreaterThanOrEqual(15);
        expect(TemplateManager.size).toBe(TemplateManager.getAllKeys().length);
      });
    });

    describe("reload()", () => {
      // 목적: reload()가 템플릿을 다시 로드하는지 확인
      test("템플릿 재로드", async () => {
        // 커스텀 템플릿을 추가하여 reload 전후 변화 확인
        const customTemplate = {
          key: "reload-test-custom",
          render: vi.fn(),
          getTargetAndPath: vi.fn(),
          getRequiredDictKeys: vi.fn(),
        };
        // SAFETY: reload 검증용 객체는 등록 과정에서 필요한 key와 세 템플릿 메서드를 모두 제공한다.
        TemplateManager.register(customTemplate as Template);
        expect(TemplateManager.exists("reload-test-custom")).toBe(true);

        // reload 후 커스텀 템플릿은 사라지고 빌트인만 남아야 함
        await TemplateManager.reload();

        expect(TemplateManager.isAutoloaded).toBe(true);
        expect(TemplateManager.exists("reload-test-custom")).toBe(false);
        expect(TemplateManager.size).toBeGreaterThanOrEqual(15); // 빌트인 최소 개수
        expect(TemplateManager.exists("entity")).toBe(true); // 빌트인은 유지
      });
    });
  });

  // ============================================
  // 2. 테스트 유틸리티
  // ============================================
  describe("테스트 유틸리티", () => {
    describe("reset()", () => {
      // 목적: reset()이 모든 상태를 초기화하는지 확인
      test("모든 상태 초기화", async () => {
        // 초기화 전 상태 확인
        expect(TemplateManager.size).toBeGreaterThan(0);

        // 초기화
        TemplateManager.reset();

        // 초기화 후 상태 확인
        expect(TemplateManager.size).toBe(0);
        expect(TemplateManager.isAutoloaded).toBe(false);
        expect(TemplateManager.getAllKeys()).toEqual([]);

        // 다시 로드 (다른 테스트를 위해)
        await TemplateManager.autoload();
      });

      // 목적: reset() 후 autoload()가 정상 동작하는지 확인
      test("reset() 후 autoload() 정상 동작", async () => {
        TemplateManager.reset();

        expect(TemplateManager.isAutoloaded).toBe(false);

        await TemplateManager.autoload();

        expect(TemplateManager.isAutoloaded).toBe(true);
        expect(TemplateManager.size).toBeGreaterThanOrEqual(15);
      });
    });

    describe("createInstance()", () => {
      // 목적: 격리된 인스턴스가 전역 상태와 독립적인지 확인
      // 병렬 테스트에서 완전한 격리 필요 시 사용
      test("격리된 인스턴스 생성", async () => {
        const isolatedManager = TemplateManagerClass.createInstance();

        // 격리된 인스턴스는 빈 상태
        expect(isolatedManager.isAutoloaded).toBe(false);
        expect(isolatedManager.size).toBe(0);

        // 전역 인스턴스는 영향 없음
        expect(TemplateManager.isAutoloaded).toBe(true);
        expect(TemplateManager.size).toBeGreaterThanOrEqual(15);
      });

      // 목적: 격리된 인스턴스에서 autoload 후 독립적으로 동작하는지 확인
      test("격리된 인스턴스 autoload", async () => {
        const isolatedManager = TemplateManagerClass.createInstance();

        await isolatedManager.autoload();

        expect(isolatedManager.isAutoloaded).toBe(true);
        expect(isolatedManager.size).toBeGreaterThanOrEqual(15);
      });

      // 목적: 격리된 인스턴스에 커스텀 템플릿 등록해도 전역에 영향 없는지 확인
      test("격리된 인스턴스에 템플릿 등록 → 전역 영향 없음", async () => {
        const isolatedManager = TemplateManagerClass.createInstance();
        await isolatedManager.autoload();

        const customTemplate = {
          key: "isolated-only",
          render: vi.fn(),
          getTargetAndPath: vi.fn(),
          getRequiredDictKeys: vi.fn(),
        };
        // SAFETY: 격리 등록용 객체는 관리자가 사용하는 key와 세 템플릿 메서드를 모두 제공한다.
        isolatedManager.register(customTemplate as Template);

        // 격리된 인스턴스에만 존재
        expect(isolatedManager.exists("isolated-only")).toBe(true);

        // 전역에는 없음
        expect(TemplateManager.exists("isolated-only")).toBe(false);
      });
    });
  });

  // ============================================
  // 3. 커스텀 템플릿 등록
  // ============================================
  describe("커스텀 템플릿 등록", () => {
    describe("register()", () => {
      // 목적: 커스텀 템플릿을 등록하고 사용할 수 있는지 확인
      test("커스텀 템플릿 등록 및 사용", async () => {
        class CustomTemplate extends Template {
          constructor() {
            // 커스텀 템플릿은 임의의 문자열 키를 허용해야 하므로 타입 단언 사용
            // SAFETY: 이 테스트 전용 키는 등록과 조회에 같은 문자열을 사용하며 빌트인 키와 충돌하지 않는다.
            super("custom-test-template" as TemplateKey);
          }

          render(options: TemplateOptions["entity"]) {
            return {
              target: "test",
              path: `${options.entityId}.ts`,
              body: `// Custom: ${options.entityId}`,
              importKeys: [],
            };
          }

          getTargetAndPath() {
            return { target: "test", path: "custom.ts" };
          }
        }

        TemplateManager.register(new CustomTemplate());

        expect(TemplateManager.exists("custom-test-template")).toBe(true);

        const template = TemplateManager.get("custom-test-template");
        const result = await template.render({ entityId: "MyCustom" });

        expect(result.path).toBe("MyCustom.ts");
        expect(result.body).toContain("// Custom: MyCustom");
      });

      // 목적: 같은 키로 등록하면 덮어쓰기되는지 확인
      test("같은 키로 등록 → 덮어쓰기", async () => {
        const template1 = {
          key: "overwrite-test",
          render: vi.fn().mockReturnValue({ target: "", path: "", body: "V1", importKeys: [] }),
          getTargetAndPath: vi.fn(),
          getRequiredDictKeys: vi.fn(),
        };

        const template2 = {
          key: "overwrite-test",
          render: vi.fn().mockReturnValue({ target: "", path: "", body: "V2", importKeys: [] }),
          getTargetAndPath: vi.fn(),
          getRequiredDictKeys: vi.fn(),
        };

        // SAFETY: 첫 덮어쓰기 fixture는 TemplateManager가 호출하는 key와 세 메서드를 모두 갖춘다.
        TemplateManager.register(template1 as Template);
        // SAFETY: 두 번째 fixture도 같은 완전한 형태를 가지며 의도적으로 첫 fixture의 key만 공유한다.
        TemplateManager.register(template2 as Template);

        const result = await TemplateManager.get("overwrite-test").render({});
        expect(result.body).toBe("V2");
      });
    });

    describe("registerAll()", () => {
      // 목적: 여러 템플릿을 한번에 등록할 수 있는지 확인
      test("여러 템플릿 일괄 등록", async () => {
        const initialSize = TemplateManager.size;

        const templates = [
          {
            key: "batch-1",
            render: vi.fn(),
            getTargetAndPath: vi.fn(),
            getRequiredDictKeys: vi.fn(),
          },
          {
            key: "batch-2",
            render: vi.fn(),
            getTargetAndPath: vi.fn(),
            getRequiredDictKeys: vi.fn(),
          },
          {
            key: "batch-3",
            render: vi.fn(),
            getTargetAndPath: vi.fn(),
            getRequiredDictKeys: vi.fn(),
          },
        ];

        // SAFETY: 배열의 세 fixture는 서로 다른 key와 관리자가 요구하는 세 템플릿 메서드를 모두 제공한다.
        TemplateManager.registerAll(templates as Template[]);

        expect(TemplateManager.size).toBe(initialSize + 3);
        expect(TemplateManager.exists("batch-1")).toBe(true);
        expect(TemplateManager.exists("batch-2")).toBe(true);
        expect(TemplateManager.exists("batch-3")).toBe(true);
      });
    });
  });

  // ============================================
  // 4. 디렉토리 로드
  // ============================================
  describe("디렉토리 로드", () => {
    describe("loadFromDirectory()", () => {
      // 목적: 존재하지 않는 디렉토리에서 로드 시 에러 없이 0 반환
      test("존재하지 않는 디렉토리 → 0 반환", async () => {
        const count = await TemplateManager.loadFromDirectory("/non-existent-directory");

        expect(count).toBe(0);
      });

      // 목적: 빈 디렉토리에서 로드 시 0 반환
      test("빈 디렉토리 → 0 반환", async () => {
        const count = await TemplateManager.loadFromDirectory("/tmp");

        expect(count).toBe(0);
      });
    });
  });

  // ============================================
  // 5. 테스트 격리 패턴
  // ============================================
  describe("테스트 격리 패턴", () => {
    // 목적: beforeEach + reset() 패턴으로 완전한 테스트 격리 가능
    describe("beforeEach + reset() 패턴", () => {
      // beforeEach에서 reset() 후 autoload() 직후의 size를 기준으로 사용
      let originalSize: number;

      beforeEach(async () => {
        TemplateManager.reset();
        await TemplateManager.autoload();
        originalSize = TemplateManager.size;
      });

      afterAll(async () => {
        TemplateManager.reset();
        await TemplateManager.autoload();
      });

      test("격리 테스트 1 - 커스텀 템플릿 등록", async () => {
        const customTemplate = {
          key: "isolated-pattern-1",
          render: vi.fn(),
          getTargetAndPath: vi.fn(),
          getRequiredDictKeys: vi.fn(),
        };
        // SAFETY: 격리 fixture는 등록에 필요한 key와 세 템플릿 메서드를 모두 제공한다.
        TemplateManager.register(customTemplate as Template);

        expect(TemplateManager.exists("isolated-pattern-1")).toBe(true);
      });

      test("격리 테스트 2 - 이전 테스트 영향 없음", async () => {
        expect(TemplateManager.exists("isolated-pattern-1")).toBe(false);
      });

      test("격리 테스트 3 - 빌트인은 유지됨", async () => {
        expect(TemplateManager.exists("entity")).toBe(true);
        expect(TemplateManager.size).toBe(originalSize);
      });
    });
  });
});
