import { api, registeredApis, stream, transactional } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeEach, describe, expect, vi } from "vitest";
import { z } from "zod";

bootstrap(vi);

const createMockTarget = (modelName: string, methodName: string) => {
  const target = {
    constructor: { name: `${modelName}Class` },
  };
  Object.defineProperty(target, methodName, { value: () => {}, configurable: true });
  return target;
};

const originalTransactionalFn = async () => "original";

describe("decorators", () => {
  beforeEach(() => {
    registeredApis.length = 0;
  });

  describe("@api + @stream 동시 사용 금지", () => {
    const mockEvents = z.object({
      message: z.string(),
      done: z.boolean(),
    });
    test("@api 후 @stream → 에러", () => {
      const target = createMockTarget("PracticeModel", "findMany");

      api({ httpMethod: "GET", clients: ["axios"] })(target, "findMany", { value: () => {} });

      expect(() => {
        stream({ type: "sse", events: mockEvents })(target, "findMany", { value: () => {} });
      }).toThrow(
        "You can use only one of @api, @stream, @websocket, or @upload decorator on the same method.",
      );
    });

    test("@stream 후 @api → 에러", () => {
      const target = createMockTarget("PracticeModel", "findMany");

      stream({ type: "sse", events: mockEvents })(target, "findMany", { value: () => {} });

      expect(() => {
        api({ httpMethod: "GET", clients: ["axios"] })(target, "findMany", { value: () => {} });
      }).toThrow(
        "You can use only one of @api, @stream, @websocket, or @upload decorator on the same method.",
      );
    });
  });

  describe("@api", () => {
    test("기본 등록", () => {
      const target = createMockTarget("PracticeModel", "findMany");
      const decorator = api({ httpMethod: "GET", clients: ["axios"] });
      decorator(target, "findMany", { value: () => {} });
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
      decorator(target, "findMany", { value: () => {} });

      expect(registeredApis[0]?.path).toEqual("/custom/path");
    });

    test("path 충돌 → 에러", () => {
      // assertNoConflictingPath 간접 테스트
      const target = createMockTarget("PracticeModel", "findMany");

      // 첫 번째 등록
      api({ path: "/path/a" })(target, "findMany", { value: () => {} });

      // 같은 메서드에 다른 path로 등록 시도
      expect(() => {
        api({ path: "/path/b" })(target, "findMany", { value: () => {} });
      }).toThrow("conflicting path");
    });

    test("options 충돌 → 에러", () => {
      // assertNoConflictingOptions 간접 테스트
      const target = createMockTarget("PracticeModel", "findMany");
      api({ guards: ["admin"] })(target, "findMany", { value: () => {} });
      expect(() => {
        api({ guards: ["user"] })(target, "findMany", { value: () => {} });
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
      decorator(target, "subscribe", { value: () => {} });

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
      decorator(target, "subscribe", { value: () => {} });

      expect(registeredApis[0]?.path).toEqual("/custom/stream");
    });

    test("path 충돌 → 에러", () => {
      const target = createMockTarget("PracticeModel", "subscribe");

      stream({ type: "sse", events: mockEvents, path: "/path/a" })(target, "subscribe", {
        value: () => {},
      });
      expect(() => {
        stream({ type: "sse", events: mockEvents, path: "/path/b" })(target, "subscribe", {
          value: () => {},
        });
      }).toThrow("conflicting path");
    });

    test("options 충돌 → 에러", () => {
      const target = createMockTarget("PracticeModel", "subscribe");

      stream({ type: "sse", events: mockEvents, guards: ["admin"] })(target, "subscribe", {
        value: () => {},
      });

      expect(() => {
        stream({ type: "sse", events: mockEvents, guards: ["user"] })(target, "subscribe", {
          value: () => {},
        });
      }).toThrow("conflicting options");
    });
  });

  describe("@transactional", () => {
    test("descriptor.value가 교체됨", () => {
      const target = createMockTarget("PracticeModel", "save");
      const descriptor = { value: originalTransactionalFn };

      transactional()(target, "save", descriptor);

      expect(descriptor.value).not.toBe(originalTransactionalFn);
      expect(descriptor.value).toEqual(expect.any(Function));
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
