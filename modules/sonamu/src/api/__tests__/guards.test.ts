import fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { setSDConfig } from "../../dict/sd";
import { UnauthorizedException } from "../../exceptions/so-exceptions";
import { type SonamuFastifyConfig } from "../../types/types";
import { type Context } from "../context";
import { type ExtendedApi, type GuardKey } from "../decorators";
import {
  checkGuardKeys,
  findApisWithUnhandledGuardKeys,
  findUnguardedMutationApis,
  warnUnguardedMutationApis,
} from "../guards";
import { Sonamu } from "../sonamu";

function makeApi(
  methodName: string,
  options: ExtendedApi["options"],
  extra: Partial<ExtendedApi> = {},
): ExtendedApi {
  return {
    modelName: "TagModel",
    methodName,
    path: `/tag/${methodName}`,
    options,
    typeParameters: [],
    parameters: [],
    returnType: "void",
    ...extra,
  };
}

describe("findUnguardedMutationApis", () => {
  it("guards가 없는 POST API를 상태 변경 무가드 API로 보고한다", () => {
    const save = makeApi("save", { httpMethod: "POST" });
    expect(findUnguardedMutationApis([save])).toEqual([save]);
  });

  it("PUT·PATCH·DELETE도 대상이며 메서드 대소문자를 구분하지 않는다", () => {
    const apis = [
      makeApi("put", { httpMethod: "PUT" }),
      makeApi("patch", { httpMethod: "PATCH" }),
      makeApi("remove", { httpMethod: "DELETE" }),
      makeApi("lower", { httpMethod: "post" }),
    ];
    expect(findUnguardedMutationApis(apis)).toEqual(apis);
  });

  it("guards를 지정했거나 guards: []로 공개를 명시한 API는 제외한다", () => {
    const apis = [
      makeApi("del", { httpMethod: "POST", guards: ["admin"] }),
      makeApi("publicSave", { httpMethod: "POST", guards: [] }),
    ];
    expect(findUnguardedMutationApis(apis)).toEqual([]);
  });

  it("GET·HEAD·OPTIONS와 httpMethod 미지정(GET) API는 제외한다", () => {
    const apis = [
      makeApi("findMany", { httpMethod: "GET" }),
      makeApi("head", { httpMethod: "HEAD" }),
      makeApi("options", { httpMethod: "OPTIONS" }),
      makeApi("defaultMethod", {}),
    ];
    expect(findUnguardedMutationApis(apis)).toEqual([]);
  });

  it("WebSocket API는 GET 업그레이드라 제외하고, @upload의 POST는 포함한다", () => {
    const ws = makeApi(
      "chat",
      { httpMethod: "POST" },
      {
        websocketOptions: { outEvents: z.object({}), inEvents: z.object({}) },
      },
    );
    const upload = makeApi(
      "upload",
      { httpMethod: "POST", clients: ["axios-multipart"] },
      { uploadOptions: {} },
    );
    expect(findUnguardedMutationApis([ws, upload])).toEqual([upload]);
  });
});

describe("warnUnguardedMutationApis", () => {
  it("무가드 상태 변경 API가 있으면 메서드·경로·모델 메서드를 담아 한 번 경고한다", () => {
    const messages: string[] = [];
    const result = warnUnguardedMutationApis(
      [makeApi("save", { httpMethod: "POST" }), makeApi("findMany", {})],
      (message) => messages.push(message),
    );

    expect(result.map((api) => api.methodName)).toEqual(["save"]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("POST /tag/save (TagModel.save)");
    expect(messages[0]).toContain("guards: []");
    expect(messages[0]).not.toContain("findMany");
  });

  it("대상이 없으면 경고하지 않는다", () => {
    const messages: string[] = [];
    warnUnguardedMutationApis([makeApi("del", { httpMethod: "POST", guards: ["admin"] })], (m) =>
      messages.push(m),
    );
    expect(messages).toEqual([]);
  });
});

describe("checkGuardKeys", () => {
  it("guardKeys를 설정하면 목록 밖 가드 키를 쓰는 API를 나열하며 부팅을 중단한다", () => {
    const apis = [
      makeApi("save", { httpMethod: "POST", guards: ["user"] }),
      makeApi("del", { httpMethod: "POST", guards: ["user", "admin"] }),
    ];
    expect(findApisWithUnhandledGuardKeys(apis, ["user"])).toEqual([
      { api: apis[1], keys: ["admin"] },
    ]);
    expect(() => checkGuardKeys(apis, ["user"], () => {})).toThrow(
      "/tag/del (TagModel.del): admin",
    );
  });

  it("guardKeys가 모든 사용 키를 포함하면 경고 없이 통과한다", () => {
    const messages: string[] = [];
    checkGuardKeys(
      [makeApi("del", { httpMethod: "POST", guards: ["admin"] })],
      ["user", "admin"],
      (m) => messages.push(m),
    );
    expect(messages).toEqual([]);
  });

  it("guardKeys가 없으면 가드를 쓰는 API가 있을 때만 경고하고 기존 동작을 유지한다", () => {
    const messages: string[] = [];
    checkGuardKeys([makeApi("del", { httpMethod: "POST", guards: ["admin"] })], undefined, (m) =>
      messages.push(m),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("guardKeys is not configured");

    const silent: string[] = [];
    checkGuardKeys([makeApi("publicSave", { httpMethod: "POST", guards: [] })], undefined, (m) =>
      silent.push(m),
    );
    expect(silent).toEqual([]);
  });
});

describe("REST 핸들러의 가드 키 처리", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  let app: FastifyInstance | undefined;

  // Fastify inject는 첫 호출에서만 내부 모듈을 로드하므로,
  // 그 비용이 첫 테스트의 시간 제한에 잡히지 않도록 미리 한 번 실행해 둔다
  beforeAll(async () => {
    const warmup = fastify();
    await warmup.inject({ method: "GET", url: "/" });
    await warmup.close();
  });

  beforeEach(() => {
    Reflect.set(Sonamu, "httpValidators", new WeakMap());
    Reflect.set(Sonamu, "pendingHttpValidators", new WeakMap());
    Reflect.set(Sonamu, "aotHttpValidatorRegistry", undefined);
    Reflect.set(Sonamu, "preparedApis", []);
    Reflect.set(Sonamu, "configValue", {
      sync: { targets: [] },
      validation: { zodCompiler: false },
      // 실제 createContext가 locale을 정하는 데 사용한다
      i18n: { defaultLocale: "ko", supportedLocales: ["ko"] },
    });
    Reflect.set(Sonamu, "syncerValue", { types: {} });
    vi.spyOn(Sonamu, "invokeModelMethod").mockResolvedValue("ok");
    // 거부 메시지는 SD로 만들므로 i18n 설정이 필요하다
    setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    Sonamu.restoreTestingSnapshot(originalState);
    vi.restoreAllMocks();
  });

  async function callWithGuards(
    guards: GuardKey[],
    guardKeys: readonly GuardKey[] | undefined,
  ): Promise<{ result: Promise<unknown>; guardHandler: ReturnType<typeof vi.fn> }> {
    const guardHandler = vi.fn();
    const config: SonamuFastifyConfig = {
      contextProvider: (defaultContext: Context) => defaultContext,
      guardHandler,
      guardKeys,
    };
    const api = makeApi("del", { httpMethod: "GET", guards });
    const handler = Sonamu.createApiHandler(api, config);

    // 실제 Fastify 요청·응답으로 핸들러를 호출하고, 핸들러가 돌려준 Promise를 그대로 검증한다
    const results: Promise<unknown>[] = [];
    app = fastify();
    app.get(api.path, (request, reply) => {
      const result = handler(request, reply);
      results.push(result);
      return result;
    });
    await app.inject({ method: "GET", url: api.path });
    const [result] = results;
    if (result === undefined) {
      throw new Error("핸들러가 호출되지 않았습니다.");
    }
    return { result, guardHandler };
  }

  it("guardKeys 밖의 키는 guardHandler를 부르지 않고 401로 거부한다", async () => {
    const { result, guardHandler } = await callWithGuards(["admin"], ["user"]);
    await expect(result).rejects.toBeInstanceOf(UnauthorizedException);
    expect(guardHandler).not.toHaveBeenCalled();
    expect(Sonamu.invokeModelMethod).not.toHaveBeenCalled();
  });

  it("guardKeys 안의 키는 guardHandler에 위임한다", async () => {
    const { result, guardHandler } = await callWithGuards(["user"], ["user"]);
    await expect(result).resolves.toBe("ok");
    expect(guardHandler).toHaveBeenCalledWith("user", expect.anything(), expect.anything());
  });

  it("guardKeys가 없으면 모든 키를 guardHandler에 위임하는 기존 동작을 유지한다", async () => {
    const { result, guardHandler } = await callWithGuards(["admin"], undefined);
    await expect(result).resolves.toBe("ok");
    expect(guardHandler).toHaveBeenCalledWith("admin", expect.anything(), expect.anything());
  });
});
