import fastify from "fastify";
import { BadRequestException, EntityManager, Sonamu } from "sonamu";
import { type SonamuFastifyConfig } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, describe, expect, expectTypeOf, vi } from "vitest";

import { DocumentModel } from "../../application/document/document.model";
import { DocumentListParams } from "../../application/document/document.types";

bootstrap(vi);

// fastify-qs가 rawParams[sonamuFilter][필드][연산자]=값 을 파싱한 모양
type RawSonamuFilter = { [field: string]: { [operator: string]: string | string[] } };
// DocumentModel.findMany가 받는 sonamuFilter 타입
type DocumentSonamuFilter = NonNullable<DocumentListParams["sonamuFilter"]>;
type UserFindManyQuery = {
  subset: "A";
  rawParams: { queryMode: "count"; sonamuFilter: RawSonamuFilter };
};

/**
 * UserModel.findMany 라우트만 올린 테스트 서버를 만듭니다.
 * fastify-qs가 만드는 중첩 쿼리 객체를 querystringParser로 그대로 주입하고,
 * 앱 onError 없이 Fastify 기본 에러 핸들러가 상태 코드를 정하게 합니다.
 */
function createUserFindManyServer(query: UserFindManyQuery) {
  const server = fastify({ routerOptions: { querystringParser: () => query } });

  const config: SonamuFastifyConfig = {
    contextProvider: (defaultContext) => ({
      ...defaultContext,
      ip: "127.0.0.1",
    }),
    guardHandler: () => true,
  };

  const userFindManyApi = Sonamu.syncer.apis.find(
    (api) => api.modelName === "UserModel" && api.methodName === "findMany",
  );
  if (!userFindManyApi) {
    throw new Error("UserModel.findMany API를 찾을 수 없습니다");
  }

  const url = Sonamu.config.api.route.prefix + userFindManyApi.path;
  server.route({
    method: userFindManyApi.options.httpMethod ?? "GET",
    url,
    handler: Sonamu.createApiHandler(userFindManyApi, config),
  });
  return { server, url };
}

async function requestUserCount(sonamuFilter: RawSonamuFilter) {
  const { server, url } = createUserFindManyServer({
    subset: "A",
    rawParams: { queryMode: "count", sonamuFilter },
  });
  try {
    return await server.inject({ method: "GET", url });
  } finally {
    await server.close();
  }
}

describe("sonamuFilter 허용 목록 (SON-613)", () => {
  describe("HTTP 요청", () => {
    beforeAll(async () => {
      Sonamu.isInitialized = false;
      await Sonamu.init(true, false, undefined, false);
    });

    test("subset 밖 비밀번호 컬럼에 startsWith를 걸면 400을 반환한다", async () => {
      const response = await requestUserCount({ password: { startsWith: "$2b$" } });

      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('"total"');
    });

    test("toFilter가 없는 컬럼 필터는 400으로 거부한다", async () => {
      const response = await requestUserCount({ email: { eq: "admin@test.com" } });

      expect(response.statusCode).toBe(400);
    });

    test("toFilter가 켜진 컬럼 필터는 그대로 동작한다", async () => {
      const response = await requestUserCount({ role: { in: ["admin", "normal"] } });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ total: expect.any(Number) });
    });
  });

  describe("모델 호출", () => {
    // 생성된 ListParams 스키마는 sonamuFilter 내용을 검사하지 않으므로,
    // API 입력처럼 스키마로 파싱한 값에는 허용 목록 밖 컬럼이 그대로 남아 모델까지 도달한다.
    test("toFilter: false 컬럼은 BadRequestException으로 거부한다", async () => {
      expectTypeOf<{ title: { startsWith: string } }>().not.toExtend<DocumentSonamuFilter>();

      const params = DocumentListParams.parse({
        sonamuFilter: { title: { startsWith: "SECRET" } },
      });
      const result = DocumentModel.findMany("A", params);
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toThrow("필드 'title'는 필터링할 수 없습니다");
    });

    test("toFilter를 지정하지 않은 컬럼은 BadRequestException으로 거부한다", async () => {
      expectTypeOf<{ content: { contains: string } }>().not.toExtend<DocumentSonamuFilter>();

      const params = DocumentListParams.parse({
        sonamuFilter: { content: { contains: "SECRET" } },
      });
      const result = DocumentModel.findMany("A", params);
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      await expect(result).rejects.toThrow("필드 'content'는 필터링할 수 없습니다");
    });

    test("toFilter 컬럼 필터는 결과를 좁힌다", async () => {
      expectTypeOf<{ status: { eq: "published" } }>().toExtend<DocumentSonamuFilter>();

      const result = await DocumentModel.findMany("A", {
        sonamuFilter: { status: { eq: "published" } },
      });

      for (const row of result.rows) {
        expect(row.status).toBe("published");
      }
    });
  });

  describe("getFilterableProps", () => {
    test("toFilter가 켜진 prop과 toFilter relation의 FK만 돌려준다", () => {
      const documentFields = EntityManager.get("Document")
        .getFilterableProps()
        .map((prop) => prop.name);
      expect(documentFields).toEqual(["status"]);

      const departmentFields = EntityManager.get("Department")
        .getFilterableProps()
        .map((prop) => prop.name);
      expect(departmentFields).toEqual(["name", "company_id", "parent_id"]);
    });
  });
});
