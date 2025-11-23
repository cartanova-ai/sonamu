import type { Abortable } from "events";
import { constants, type Mode, type ObjectEncodingOptions, type OpenMode, type PathLike } from "fs";
import { access, type FileHandle } from "fs/promises";
import { join } from "path";
import { Naite, Sonamu } from "sonamu";
import type Stream from "stream";
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

  test("fs/promises mock is working", async () => {
    // 가상 파일
    const filePath = join(apiRootPath, "this-file-does-not-actually-exist.ts");
    const isExists = await exists(filePath);
    expect(isExists).toBe(true);

    // 확인
    Naite.expect("fs:access").toBe(filePath);
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

      // // Template__generated:body
      // Naite.expect("Template__generated:body").toMatchSnapshot();

      // formatCode:result
      // expect(Naite.get("formatCode:result")[1]).toMatchSnapshot();

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
      expect(Naite.get("fs:writeFile")[0].file).toBe(
        join(apiRootPath, "src/services/user/user.service.ts").replace("/api", "/web"),
      );
      expect(Naite.get("fs:writeFile")[1].file).toBe(
        join(apiRootPath, "src/application/sonamu.generated.http"),
      );

      // step
      Naite.expect("step").toMatchSnapshot();
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
      expect(Naite.get("fs:writeFile")).toBeDefined();
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

// fs/promises mock
vi.mock(import("fs/promises"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    access: vi.fn(async (path: PathLike, mode?: number): Promise<void> => {
      Naite.t("fs:access", path);

      if (typeof path === "string" && path.endsWith("this-file-does-not-actually-exist.ts")) {
        return;
      }
      return actual.access(path, mode);
    }),
    writeFile: vi.fn(
      (
        file: PathLike | FileHandle,
        data:
          | string
          | NodeJS.ArrayBufferView
          | Iterable<string | NodeJS.ArrayBufferView>
          | AsyncIterable<string | NodeJS.ArrayBufferView>
          | Stream,
        _options?:
          | (ObjectEncodingOptions & {
              mode?: Mode | undefined;
              flag?: OpenMode | undefined;
              /**
               * If all data is successfully written to the file, and `flush`
               * is `true`, `filehandle.sync()` is used to flush the data.
               * @default false
               */
              flush?: boolean | undefined;
            } & Abortable)
          | BufferEncoding
          | null,
      ): Promise<void> => {
        Naite.t("fs:writeFile", { file, data });
        return Promise.resolve(undefined);
        // return actual.writeFile(file, data, options);
      },
    ),
  };
});
