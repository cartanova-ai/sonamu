import { api, registeredApis } from "sonamu";
import { beforeEach, describe, expect, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);

describe("decorators", () => {
  beforeEach(() => {
    registeredApis.length = 0;
  });

  // Mock DecoratorTarget 생성 헬퍼
  const createMockTarget = (modelName: string) => ({
    constructor: { name: `${modelName}Class` },
  });

  describe("@api", () => {
    test("기본 등록", () => {
      const target = createMockTarget("PracticeModel");
      const decorator = api();
      decorator(target, "findMany");

      expect(registeredApis).toHaveLength(1);
      expect(registeredApis[0]).toMatchObject({
        modelName: "PracticeModel",
        methodName: "findMany",
        path: "/practice/findMany", // 자동 생성
      });
    });

    test("path 커스텀", () => {
      const target = createMockTarget("PracticeModel");
      const decorator = api({ path: "/custom/path" });
      decorator(target, "findMany");

      expect(registeredApis[0]?.path).toEqual("/custom/path");
    });

    test("path 충돌 → 에러", () => {
      // assertNoConflictingPath 간접 테스트
      const target = createMockTarget("PracticeModel");

      // 첫 번째 등록
      api({ path: "/path/a" })(target, "findMany");

      // 같은 메서드에 다른 path로 등록 시도
      expect(() => {
        api({ path: "/path/b" })(target, "findMany");
      }).toThrow("conflicting path");
    });

    test("options 충돌 → 에러", () => {
      // assertNoConflictingOptions 간접 테스트
      const target = createMockTarget("PracticeModel");
      api({ resourceName: "Users" })(target, "findMany");
      expect(() => {
        api({ resourceName: "Posts" })(target, "findMany");
      }).toThrow("conflicting options");
    });
  });

  // describe("@stream", () => {
  //   type MockStreamDecoratorOptions = {
  //     type: "sse"; // | 'ws
  //     events: typeof mockEvents;
  //     path?: string;
  //     resourceName?: string;
  //     guards?: GuardKey[];
  //     description?: string;
  //   };

  //   // mock ZodObject
  //   const mockEvents = z.object({
  //     message: z.string(),
  //     done: z.boolean(),
  //   });

  //   test("기본 등록", () => {
  //     const target = createMockTarget("PracticeModel");
  //     const decorator = stream({ type: "sse", events: mockEvents });
  //     decorator(target, "subscribe");

  //     expect(registeredApis).toHaveLength(1);
  //     expect(registeredApis[0]).toMatchObject({
  //       modelName: "PracticeModel",
  //       methodName: "subscribe",
  //       path: "/practice/subscribe",
  //     });
  //     // streamOptions 확인
  //     expect(registeredApis[0]?.streamOptions).toMatchObject({
  //       type: "sse",
  //       events: mockEvents,
  //     });
  //   });

  //   test("path 커스텀", () => {
  //     const target = createMockTarget("PracticeModel");
  //     const decorator = stream({
  //       type: "sse",
  //       events: mockEvents,
  //       path: "/custom/stream",
  //     });
  //     decorator(target, "subscribe");

  //     expect(registeredApis[0]?.path).toEqual("/custom/stream");
  //   });

  //   // test("@api와 결합 시 에러", () => {
  //   //   const target = createMockTarget("PracticeModel");

  //   //   // @api 등록
  //   //   api({ resourceName: "Practice" })(target, "subscribe");
  //   //   // @stream 추가
  //   //   expect(() => {
  //   //     stream({ type: "sse", events: mockEvents })(target, "subscribe");
  //   //   }).toThrow("conflicting options");
  //   // });

  //   test("path 충돌 → 에러", () => {
  //     const target = createMockTarget("PracticeModel");

  //     api({ path: "/path/a" })(target, "subscribe");

  //     expect(() => {
  //       stream({
  //         type: "sse",
  //         events: mockEvents,
  //         path: "/path/b",
  //       })(target, "subscribe");
  //     }).toThrow("conflicting path");
  //   });

  //   test("options 충돌 → 에러", () => {
  //     const target = createMockTarget("PracticeModel");

  //     api({ guards: ["admin"] })(target, "subscribe");

  //     expect(() => {
  //       stream({
  //         type: "sse",
  //         events: mockEvents,
  //         guards: ["user"], // 다른 값
  //       })(target, "subscribe");
  //     }).toThrow("conflicting options");
  //   });
  // });

  // describe("@upload", () => {
  //   test("기본 등록", () => {
  //     const target = createMockTarget("PracticeModel");
  //     const decorator = upload(target, "upload");
  //   });

  //   test("mode 커스텀", () => {
  //     const target = createMockTarget("PracticeModel");
  //     const decorator = upload({ mode: "multiple" });
  //     decorator();
  //   });

  //   test("mode 충돌 → 에러", () => {
  //     const target = createMockTarget("PracticeModel");
  //     const decorator = upload({ mode: "single" });
  //     decorator(target, "upload");
  //     expect(() => {
  //       decorator(target, "upload");
  //     }).toThrow("conflicting mode");
  //   });
  // });
});
