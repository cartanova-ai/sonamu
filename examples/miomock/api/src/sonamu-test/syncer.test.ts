import { constants } from "fs";
import { access } from "fs/promises";
import { join } from "path";
import { Naite, Sonamu } from "sonamu";
import { beforeAll, describe, expect, vi } from "vitest";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);
describe("Syncer", () => {
  let apiRootPath: string;
  let syncer: typeof Sonamu.syncer;
  beforeAll(async () => {
    // Sonamu가 테스팅 로드된 상태이므로 다시 초기화
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);

    apiRootPath = join(Sonamu.appRootPath, "api");
    syncer = Sonamu.syncer;
    expect(syncer).toBeDefined();
  });

  test.only("fs/promises mock is working", async () => {
    // 가상 파일 Mock 설정
    const filePath = join(apiRootPath, "this-file-does-not-actually-exist.ts");
    const mockFs = Naite.useMock("fs/promises");
    mockFs.when("access", [filePath]).returns();

    // 존재 확인
    const isExists = await exists(filePath);
    expect(isExists).toBe(true);

    // 확인
    Naite.expect("mocked:fs/promises.access").toMatchInlineSnapshot(`
      {
        "args": [
          "${filePath}",
          0,
        ],
        "config": {
          "returns": undefined,
          "when": [
            "${filePath}",
          ],
        },
      }
    `);
  });

  describe("generateTemplate", () => {
    test("handleEntityChange", async () => {
      // 진입점: handleEntityChange
      await syncer.handleEntityChange(
        {
          entity: [`/${join(apiRootPath, "src/application/user/user.entity.ts")}`],
          types: [],
          functions: [],
          generated: [],
          model: [],
          frame: [],
          config: [],
        },
        ["types"],
      );

      // Template__generated:body
      // Naite.expect("Template__generated:body").toMatchSnapshot();

      // formatCode:linted
      // expect(Naite.get("formatCode:linted:content")).toMatchSnapshot();
      // expect(Naite.get("formatCode:linted:diagnostics")).toMatchSnapshot();

      // resolveRenderedTemplate:formatted
      // Naite.expect("resolveRenderedTemplate:formatted:generated").toMatchSnapshot();

      // step
      Naite.expect("step").toMatchSnapshot();
    });

    test("handleModelOrFrameChange", async () => {
      // 진입점: handleModelOrFrameChange
      await syncer.handleModelOrFrameChange({
        model: [`/${join(apiRootPath, "src/application/user/user.model.ts")}`],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

      // 중간:actionGenerateServices
      expect(Naite.get("actionGenerateServices")).toEqual([
        {
          namesRecord: {
            camel: "user",
            camelPlural: "users",
            capital: "User",
            capitalPlural: "Users",
            constant: "USER",
            fs: "user",
            fsPlural: "users",
            upper: "USER",
          },
        },
      ]);

      // writeFile
      expect(Naite.get("fs/promises:writeFile")[0]).toBe(
        join(apiRootPath, "src/services/user/user.service.ts").replace("/api", "/web"),
      );
      expect(Naite.get("fs/promises:writeFile")[1]).toBe(
        join(apiRootPath, "src/application/sonamu.generated.http"),
      );

      // // step
      // Naite.expect("step").toMatchSnapshot();
    });

    test("service", async () => {
      await syncer.generateTemplate(
        "service",
        {
          namesRecord: {
            camel: "user",
            camelPlural: "users",
            capital: "User",
            capitalPlural: "Users",
            constant: "USER",
            fs: "user",
            fsPlural: "users",
            upper: "USER",
          },
          modelTsPath: join(apiRootPath, "src/application/user/user.model.ts"),
        },
        {
          overwrite: true,
        },
      );
      expect(Naite.get("fs/promises:writeFile")).toBeDefined();
    });

    test("scaffolding: model", async () => {
      await syncer.generateTemplate(
        "model",
        {
          entityId: "User",
        },
        {
          overwrite: true,
        },
      );

      Naite.expect("step").toMatchSnapshot();

      // formatted and linted
      // expect(Naite.get("formatCode:formatted").content).toMatchSnapshot();
      // expect(Naite.get("formatCode:linted").content).toMatchSnapshot();
      // expect(Naite.get("resolveRenderedTemplate:formatted:model")).toMatchSnapshot();
    });
  });
});

// 유틸 그대로 사용하는 경우 순환의존성 발생하여 분리
async function exists(filePath: string) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
