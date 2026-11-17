import Fastify, { type FastifyInstance, type InjectOptions } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Sonamu } from "../../api/sonamu";
import { setSDConfig } from "../../dict/sd";
import { sonamuDictionary } from "../../dict/sonamu-dictionary";
import { EntityManager } from "../../entity/entity-manager";
import { Syncer } from "../../syncer/syncer";
import { type RenderedTemplate, Template } from "../../template/template";
import { TemplateManager } from "../../template/template-manager";
import { registerScaffoldingApi } from "../scaffolding-api";

// 라우트는 템플릿에서 getRequiredDictKeys만 읽으므로 렌더링 메서드는 호출되면 안 됩니다.
class StubTemplate extends Template {
  constructor() {
    super("model");
  }

  render(): RenderedTemplate {
    throw new Error("StubTemplate.render는 호출되면 안 됩니다");
  }

  getTargetAndPath(): { target: string; path: string } {
    throw new Error("StubTemplate.getTargetAndPath는 호출되면 안 됩니다");
  }
}

const REGISTERED_ENTITY_IDS = new Set(["Post", "User"]);

// 감사 PoC에서 쓴 entityId 형태들입니다. 실제 명령 대신 무해한 표식만 담습니다.
const MALICIOUS_ENTITY_IDS = [
  "../s3probe",
  "../../../../../s3out",
  'S3Probe");globalThis.__s3probe=1;("',
  "S3 Bad Id",
  "s3_probe-x",
  "Post/../../Escape",
];

const DISALLOWED_TEMPLATE_KEYS = ["entity", "generated", "init_types", "sd", "unknown_template"];

/** 파일을 실제로 쓰지 않고 호출 여부만 기록하도록 Syncer 메서드를 대체합니다. */
function stubSyncer(target: Syncer) {
  return {
    generateTemplate: vi.spyOn(target, "generateTemplate").mockResolvedValue([]),
    renderTemplate: vi
      .spyOn(target, "renderTemplate")
      .mockResolvedValue([{ path: "api/src/x.ts", code: "// x" }]),
    checkExistsGenCode: vi.spyOn(target, "checkExistsGenCode").mockResolvedValue({
      subPath: "api/src/x.ts",
      fullPath: "/tmp/api/src/x.ts",
      isExists: false,
    }),
  };
}

describe("Sonamu UI scaffolding API 입력 검증", () => {
  const originalState = Sonamu.captureTestingSnapshot();
  let server: FastifyInstance;
  let syncer: ReturnType<typeof stubSyncer>;

  beforeEach(async () => {
    const realSyncer = new Syncer();
    syncer = stubSyncer(realSyncer);
    Sonamu.syncer = realSyncer;
    vi.spyOn(EntityManager, "exists").mockImplementation((entityId) =>
      REGISTERED_ENTITY_IDS.has(entityId),
    );
    vi.spyOn(TemplateManager, "get").mockReturnValue(new StubTemplate());
    vi.spyOn(sonamuDictionary, "ensureDictKeys").mockResolvedValue([]);
    // 거부 응답의 오류 메시지를 만들 수 있도록 i18n 설정을 주입합니다.
    setSDConfig({ defaultLocale: "ko", supportedLocales: ["ko"] });

    server = Fastify();
    await server.register(registerScaffoldingApi, { prefix: "/sonamu-ui" });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
    vi.restoreAllMocks();
    Sonamu.restoreTestingSnapshot(originalState);
  });

  function post(route: "getStatus" | "generate" | "preview", payload: InjectOptions["payload"]) {
    return server.inject({
      method: "POST",
      url: `/sonamu-ui/api/scaffolding/${route}`,
      payload,
    });
  }

  function expectNothingRendered() {
    expect(syncer.generateTemplate).not.toHaveBeenCalled();
    expect(syncer.renderTemplate).not.toHaveBeenCalled();
    expect(syncer.checkExistsGenCode).not.toHaveBeenCalled();
  }

  describe("generate", () => {
    it.each(MALICIOUS_ENTITY_IDS)(
      "형식이 어긋난 entityId %j는 400으로 거부한다",
      async (entityId) => {
        const response = await post("generate", {
          options: [{ entityId, templateKey: "model_test", overwrite: true }],
        });

        expect(response.statusCode).toBe(400);
        expectNothingRendered();
      },
    );

    it.each(DISALLOWED_TEMPLATE_KEYS)(
      "허용되지 않은 templateKey %j는 400으로 거부한다",
      async (templateKey) => {
        const response = await post("generate", { options: [{ entityId: "Post", templateKey }] });

        expect(response.statusCode).toBe(400);
        expectNothingRendered();
      },
    );

    it("등록되지 않은 entityId는 형식이 맞아도 400으로 거부한다", async () => {
      const response = await post("generate", {
        options: [{ entityId: "Unregistered", templateKey: "model" }],
      });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("여러 항목 중 하나라도 잘못되면 아무 파일도 생성하지 않는다", async () => {
      const response = await post("generate", {
        options: [
          { entityId: "Post", templateKey: "model" },
          { entityId: "../s3probe", templateKey: "model_test" },
        ],
      });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("options가 배열이 아니면 400으로 거부한다", async () => {
      const response = await post("generate", { options: "model" });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("허용된 templateKey와 등록된 entityId는 entityId만 넘겨 생성한다", async () => {
      const response = await post("generate", {
        options: [
          { entityId: "Post", templateKey: "model_test", enumId: "x/../y", overwrite: true },
        ],
      });

      expect(response.statusCode).toBe(200);
      expect(syncer.generateTemplate).toHaveBeenCalledTimes(1);
      expect(syncer.generateTemplate).toHaveBeenCalledWith(
        "model_test",
        { entityId: "Post" },
        { overwrite: true },
      );
    });
  });

  describe("preview", () => {
    it("../ 가 든 entityId는 400으로 거부한다", async () => {
      const response = await post("preview", {
        option: { entityId: "../s3probe", templateKey: "model_test" },
      });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("허용되지 않은 templateKey는 400으로 거부한다", async () => {
      const response = await post("preview", {
        option: { entityId: "Post", templateKey: "entity" },
      });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("정상 요청은 렌더링 결과를 돌려준다", async () => {
      const response = await post("preview", {
        option: { entityId: "Post", templateKey: "view_form" },
      });

      expect(response.statusCode).toBe(200);
      expect(syncer.renderTemplate).toHaveBeenCalledWith("view_form", { entityId: "Post" });
    });
  });

  describe("getStatus", () => {
    it("../ 가 든 entityId로 저장소 밖 경로를 조회하지 못한다", async () => {
      const response = await post("getStatus", {
        entityIds: ["../../../../etc/hosts/x"],
        templateKeys: ["model"],
      });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("허용되지 않은 templateKey는 400으로 거부한다", async () => {
      const response = await post("getStatus", {
        entityIds: ["Post"],
        templateKeys: ["model", "entity"],
      });

      expect(response.statusCode).toBe(400);
      expectNothingRendered();
    });

    it("정상 요청은 entityId와 templateKey 조합별 상태를 돌려준다", async () => {
      const response = await post("getStatus", {
        entityIds: ["User", "Post"],
        templateKeys: ["view_list", "model"],
      });

      expect(response.statusCode).toBe(200);
      expect(syncer.checkExistsGenCode.mock.calls).toEqual([
        ["Post", "model"],
        ["Post", "view_list"],
        ["User", "model"],
        ["User", "view_list"],
      ]);
    });
  });
});
