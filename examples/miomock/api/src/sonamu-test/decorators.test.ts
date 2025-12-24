import { api, registeredApis, stream, transactional, upload } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeEach, describe, expect, vi } from "vitest";
import z from "zod";

bootstrap(vi);

describe("decorators", () => {
  beforeEach(() => {
    registeredApis.length = 0;
  });

  // Mock DecoratorTarget 생성 헬퍼
  const createMockTarget = (modelName: string, methodName: string) => {
    const target: Record<string, unknown> & { constructor: { name: string } } = {
      constructor: { name: `${modelName}Class` },
    };
    target[methodName] = () => {}; // 빈 메서드 추가
    return target;
  };

  describe("@api + @stream 동시 사용 금지", () => {
    const mockEvents = z.object({
      message: z.string(),
      done: z.boolean(),
    });
    test("@api 후 @stream → 에러", () => {
      const target = createMockTarget("PracticeModel", "findMany");

      api({ httpMethod: "GET", clients: ["axios"] })(target, "findMany");

      expect(() => {
        stream({ type: "sse", events: mockEvents })(target, "findMany");
      }).toThrow("You can use only one of @api or @stream");
    });

    test("@stream 후 @api → 에러", () => {
      const target = createMockTarget("PracticeModel", "findMany");

      stream({ type: "sse", events: mockEvents })(target, "findMany");

      expect(() => {
        api({ httpMethod: "GET", clients: ["axios"] })(target, "findMany");
      }).toThrow("You can use only one of @api or @stream");
    });
  });

  describe("@api", () => {
    test("기본 등록", () => {
      const target = createMockTarget("PracticeModel", "findMany");
      const decorator = api({ httpMethod: "GET", clients: ["axios"] });
      decorator(target, "findMany");
      expect(registeredApis).toHaveLength(1);
      expect(registeredApis[0]).toMatchObject({
        modelName: "PracticeModel",
        methodName: "findMany",
        path: "/practice/findMany", // 자동 생성
      });
    });

    test("path 커스텀", () => {
      const target = createMockTarget("PracticeModel", "findMany");
      const decorator = api({ path: "/custom/path" });
      decorator(target, "findMany");

      expect(registeredApis[0]?.path).toEqual("/custom/path");
    });

    test("path 충돌 → 에러", () => {
      // assertNoConflictingPath 간접 테스트
      const target = createMockTarget("PracticeModel", "findMany");

      // 첫 번째 등록
      api({ path: "/path/a" })(target, "findMany");

      // 같은 메서드에 다른 path로 등록 시도
      expect(() => {
        api({ path: "/path/b" })(target, "findMany");
      }).toThrow("conflicting path");
    });

    test("options 충돌 → 에러", () => {
      // assertNoConflictingOptions 간접 테스트
      const target = createMockTarget("PracticeModel", "findMany");
      api({ guards: ["admin"] })(target, "findMany");
      expect(() => {
        api({ guards: ["user"] })(target, "findMany");
      }).toThrow("conflicting options");
    });
  });

  describe("@stream", () => {
    // mock ZodObject
    const mockEvents = z.object({
      message: z.string(),
      done: z.boolean(),
    });

    test("기본 등록", () => {
      const target = createMockTarget("PracticeModel", "subscribe");
      const decorator = stream({ type: "sse", events: mockEvents });
      decorator(target, "subscribe");

      expect(registeredApis).toHaveLength(1);
      expect(registeredApis[0]).toMatchObject({
        modelName: "PracticeModel",
        methodName: "subscribe",
        path: "/practice/subscribe",
      });
      // streamOptions 확인
      expect(registeredApis[0]?.streamOptions).toMatchObject({
        type: "sse",
        events: mockEvents,
      });
    });

    test("path 커스텀", () => {
      const target = createMockTarget("PracticeModel", "subscribe");
      const decorator = stream({
        type: "sse",
        events: mockEvents,
        path: "/custom/stream",
      });
      decorator(target, "subscribe");

      expect(registeredApis[0]?.path).toEqual("/custom/stream");
    });

    test("path 충돌 → 에러", () => {
      const target = createMockTarget("PracticeModel", "subscribe");

      stream({ type: "sse", events: mockEvents, path: "/path/a" })(target, "subscribe");
      expect(() => {
        stream({ type: "sse", events: mockEvents, path: "/path/b" })(target, "subscribe");
      }).toThrow("conflicting path");
    });

    test("options 충돌 → 에러", () => {
      const target = createMockTarget("PracticeModel", "subscribe");

      stream({ type: "sse", events: mockEvents, guards: ["admin"] })(target, "subscribe");

      expect(() => {
        stream({ type: "sse", events: mockEvents, guards: ["user"] })(target, "subscribe");
      }).toThrow("conflicting options");
    });
  });

  describe("@upload", () => {
    test("@api와 함께 사용 - uploadOptions 추가", () => {
      const target = createMockTarget("PracticeModel", "save");

      // @api 먼저
      api({ httpMethod: "POST", clients: ["axios"] })(target, "save");

      // @upload 추가
      upload({ mode: "multiple" })(target, "save", {
        value: () => {},
      });

      expect(registeredApis).toHaveLength(1);
      expect(registeredApis[0]?.uploadOptions).toEqual({
        mode: "multiple",
      });
    });

    test("@upload 단독 → path 빈 스트링으로 등록", () => {
      const target = createMockTarget("PracticeModel", "save");

      upload({ mode: "multiple" })(target, "save", {
        value: () => {},
      });

      expect(registeredApis).toHaveLength(1);
      expect(registeredApis[0]?.path).toEqual("");
      expect(registeredApis[0]?.uploadOptions).toEqual({
        mode: "multiple",
      });
    });

    test("@upload 후 @api → path 채워지고 uploadOptions 유지", () => {
      const target = createMockTarget("PracticeModel", "save");

      upload({ mode: "single" })(target, "save", {
        value: () => {},
      });
      api({ path: "/practice/save" })(target, "save");

      expect(registeredApis).toHaveLength(1);
      expect(registeredApis[0]?.path).toEqual("/practice/save"); // 채워짐
      expect(registeredApis[0]?.uploadOptions).toEqual({
        mode: "single",
      }); // 유지
    });
  });

  describe("@transactional", () => {
    test("descriptor.value가 교체됨", () => {
      const target = createMockTarget("PracticeModel", "save");
      const originalFn = async () => "original";
      const descriptor = { value: originalFn };

      transactional()(target, "save", descriptor);

      expect(descriptor.value).not.toBe(originalFn);
      expect(typeof descriptor.value).toBe("function");
    });

    test("options 전달 확인 (isolation, readOnly, dbPreset)", () => {
      const target = createMockTarget("PracticeModel", "save");
      const descriptor = { value: async () => {} };

      // 에러 없이 옵션이 전달되는지만 확인
      expect(() => {
        transactional({ isolation: "serializable", readOnly: true, dbPreset: "w" })(
          target,
          "save",
          descriptor,
        );
      }).not.toThrow();
    });
  });
});
