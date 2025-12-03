import { api, registeredApis, stream } from "sonamu";
import { beforeEach, describe, expect, vi } from "vitest";
import z from "zod";
import { bootstrap, test } from "../testing/bootstrap";

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
});
