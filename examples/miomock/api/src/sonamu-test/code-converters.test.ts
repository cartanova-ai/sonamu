import { join } from "path";
import { Sonamu } from "sonamu";
import { beforeAll, describe, vi } from "vitest";
import { getZodObjectFromApi } from "../../../../../modules/sonamu/dist/api/code-converters";
import type { ExtendedApi } from "../../../../../modules/sonamu/dist/api/decorators";
import { Naite } from "../../../../../modules/sonamu/dist/naite/naite";
import { readApisFromFile } from "../../../../../modules/sonamu/dist/syncer/api-parser";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);
describe("Code Converters", () => {
  let userApis: ExtendedApi[];
  let apiRootPath: string;

  beforeAll(async () => {
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);

    apiRootPath = join(Sonamu.appRootPath, "api");

    // User 모델에서 실제 API 정보 파싱
    const userModelPath = join(apiRootPath, "src/application/user/user.model.ts");
    // biome-ignore lint/suspicious/noExplicitAny: AbsolutePath 타입 캐스팅 필요
    userApis = await readApisFromFile(userModelPath as any);
  });

  test("제네릭 없는 단순 API - save", async () => {
    const saveApi = userApis.find((api) => api.methodName === "save");
    if (!saveApi) return;

    getZodObjectFromApi(saveApi);
    Naite.expect("step").toMatchSnapshot();
    Naite.expect("references").toMatchSnapshot();
    Naite.expect("Final ReqType shape").toMatchSnapshot();
    Naite.expect("Final ReqType shape keys").toMatchSnapshot();
    Naite.expect("Type of Final ReqType").toMatchSnapshot();
  });

  test("제네릭 있는 API - findById", async () => {
    // Naite.expect("step").toMatchSnapshot();
    const findByIdApi = userApis.find((api) => api.methodName === "findById");
    if (!findByIdApi) return;

    // getZodObjectFromApi 호출
    const references = {};
    getZodObjectFromApi(findByIdApi, references);

    Naite.expect("step").toMatchSnapshot();

    // 제네릭 처리 단계 검증
    Naite.expect("length of typeParameters").toMatchSnapshot();

    // 최종 단계 검증
    Naite.expect("Final ReqType shape").toMatchSnapshot();
    Naite.expect("Final ReqType shape keys").toMatchSnapshot();
    Naite.expect("Type of Final ReqType").toMatchSnapshot();
  });

  test("제네릭 있는 API - findMany (optional 파라미터)", async () => {
    const findManyApi = userApis.find((api) => api.methodName === "findMany");
    if (!findManyApi) return;

    const references = {};
    getZodObjectFromApi(findManyApi, references);

    Naite.expect("step").toMatchSnapshot();

    // 제네릭 처리 단계 검증
    Naite.expect("length of typeParameters").toMatchSnapshot();

    // 최종 단계 검증
    Naite.expect("Final ReqType shape").toMatchSnapshot();
    Naite.expect("Final ReqType shape keys").toMatchSnapshot();
    Naite.expect("Type of Final ReqType").toMatchSnapshot();
  });

  // test("Context 필터링 - getMyIP", async () => {
  //   const getMyIPApi = userApis.find((api) => api.methodName === "getMyIP");
  //   if (!getMyIPApi) return;

  //   // getZodObjectFromApi 호출
  //   const zodSchema = getZodObjectFromApi(getMyIPApi);

  //   // 파라미터가 필터링되어야 함
  //   const shape = zodSchema._def.shape;
  //   expect(Object.keys(shape).length).toBe(0);

  //   // Naite 추적 값 검증
  //   Naite.expect("step2").toBe("getZodObjectFromApi: Filtering API Parameters");
  // });

  // test("_로 시작하는 optional 파라미터 필터링", async () => {
  //   // 수동으로 만든 테스트 API
  //   const testApi: ExtendedApi = {
  //     modelName: "Test",
  //     methodName: "testMethod",
  //     path: "/test/testMethod",
  //     options: {
  //       httpMethod: "POST",
  //     },
  //     typeParameters: [],
  //     parameters: [
  //       {
  //         name: "normalParam",
  //         type: "string",
  //         optional: false,
  //       },
  //       {
  //         name: "_internalParam",
  //         type: "string",
  //         optional: true,
  //       },
  //       {
  //         name: "anotherParam",
  //         type: "number",
  //         optional: false,
  //       },
  //     ],
  //     returnType: "string",
  //   };

  //   const zodSchema = getZodObjectFromApi(testApi);
  //   const shape = zodSchema._def.shape;
  //   const paramNames = Object.keys(shape);

  //   // normalParam과 anotherParam은 포함되어야 함
  //   expect(paramNames).toContain("normalParam");
  //   expect(paramNames).toContain("anotherParam");

  //   // _internalParam은 제외되어야 함 (optional && _로 시작)
  //   expect(paramNames).not.toContain("_internalParam");
  // });

  // test("배열 파라미터 변환 - save", async () => {
  //   const saveApi = userApis.find((api) => api.methodName === "save");
  //   if (!saveApi) return;

  //   const zodSchema = getZodObjectFromApi(saveApi);
  //   const shape = zodSchema._def.shape;

  //   // spa 파라미터가 있어야 함
  //   expect(shape).toHaveProperty("spa");

  //   // spa가 배열 타입이어야 함
  //   const spaSchema = shape.spa;
  //   // biome-ignore lint/suspicious/noExplicitAny: Zod 내부 타입 확인
  //   expect((spaSchema._def as any).typeName).toBe("ZodArray");
  // });

  // test("배열 파라미터 변환 - del", async () => {
  //   const delApi = userApis.find((api) => api.methodName === "del");
  //   if (!delApi) return;

  //   const zodSchema = getZodObjectFromApi(delApi);
  //   const shape = zodSchema._def.shape;

  //   // ids 파라미터가 있어야 함
  //   expect(shape).toHaveProperty("ids");

  //   // ids가 배열 타입이어야 함
  //   const idsSchema = shape.ids;
  //   // biome-ignore lint/suspicious/noExplicitAny: Zod 내부 타입 확인
  //   expect((idsSchema._def as any).typeName).toBe("ZodArray");

  //   // 배열의 요소 타입이 number여야 함
  //   // biome-ignore lint/suspicious/noExplicitAny: Zod 내부 타입 확인
  //   expect((idsSchema._def as any).type._def.typeName).toBe("ZodNumber");
  // });
});
