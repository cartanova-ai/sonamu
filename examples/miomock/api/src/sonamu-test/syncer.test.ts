import type { Abortable } from "events";
import type { Mode, ObjectEncodingOptions, OpenMode, PathLike } from "fs";
import type { FileHandle } from "fs/promises";
import { join } from "path";
import { Naite, Sonamu } from "sonamu";
import type Stream from "stream";
import { beforeAll, describe, expect, vi } from "vitest";
import type { AbsolutePath } from "../../../../../modules/sonamu/dist/utils/path-utils";
import { bootstrap, test } from "../testing/bootstrap";

bootstrap(vi);

describe("Syncer", () => {
  let apiRootPath: string;
  let syncer: typeof Sonamu.syncer;

  beforeAll(async () => {
    Sonamu.isInitialized = false;
    await Sonamu.init(true, false, undefined, false);

    apiRootPath = join(Sonamu.appRootPath, "api");
    syncer = Sonamu.syncer;
    expect(syncer).toBeDefined();
  });

  test("vi.fn test", async () => {
    const mockFn = vi.fn((path: PathLike, mode?: number): Promise<void> => {
      Naite.t("vi.fn", { path, mode, status: mode === 0 ? "success" : "error" });
      if (mode === 0) {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error("test error"));
    });

    try {
      await mockFn("test.txt", 0);
      await mockFn("test.txt", 1);
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      console.log("error", error);
      expect(error.message).toBe("test error");
    } finally {
      expect(mockFn).toHaveBeenCalledWith("test.txt", 0);
      expect(mockFn).toHaveBeenCalledWith("test.txt", 1);
      expect(mockFn).toHaveBeenCalledTimes(2);
    }
    Naite.expect("vi.fn").toMatchSnapshot();
  });

  test("fs/promises mock is working", async () => {
    // 가상 파일
    const filePath = join(apiRootPath, "this-file-does-not-actually-exist.ts");
    const isExists = await exists(filePath);
    expect(isExists).toBe(true);

    // 확인
    Naite.expect("fs:access").toBe(filePath);
  });
  // ============================================
  // 7. 파일 타입 분류
  // ============================================
  describe("파일 타입 분류", () => {
    test("지원하는 파일 타입 분류", async () => {
      const paths = [
        join(apiRootPath, "src/application/user/user.types.ts"),
        join(apiRootPath, "src/application/user/user.model.ts"),
        join(apiRootPath, "src/application/sonamu.config.ts"),
        join(apiRootPath, "src/application/sonamu.generated.ts"),
      ] as AbsolutePath[];

      const diffGroups = (syncer as any).calculateDiffGroups(paths);

      expect(diffGroups.types?.length).toBe(1);
      expect(diffGroups.model?.length).toBe(1);
      expect(diffGroups.config?.length).toBe(1);
      expect(diffGroups.generated?.length).toBe(1);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("같은 타입 여러 파일", async () => {
      const paths = [
        join(apiRootPath, "src/application/user/user.model.ts"),
        join(apiRootPath, "src/application/project/project.model.ts"),
        join(apiRootPath, "src/application/company/company.model.ts"),
      ] as AbsolutePath[];

      const diffGroups = (syncer as any).calculateDiffGroups(paths);
      expect(diffGroups.model?.length).toBe(3);
    });
  });

  // ============================================
  // 8. Config 동기화
  // ============================================
  describe("Config 동기화", () => {
    test(".sonamu.env 생성", async () => {
      await (syncer as any).actionSyncConfig();

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const configFile = writeFilesArray.find((f: any) => f.file.includes(".sonamu.env"));

      expect(configFile).toBeDefined();
      expect(configFile.data).toContain("API_HOST=");
      expect(configFile.data).toContain("API_PORT=");
    });

    test("config 값 정확성", async () => {
      await (syncer as any).actionSyncConfig();

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const configFile = writeFilesArray.find((f: any) => f.file.includes(".sonamu.env"));

      const { host, port } = Sonamu.config.server.listen ?? {};
      expect(configFile.data).toContain(`API_HOST=${host ?? "localhost"}`);
      expect(configFile.data).toContain(`API_PORT=${port ?? 3000}`);
    });
  });

  // ============================================
  // 9. Schema 생성
  // ============================================
  describe("Schema 생성", () => {
    test("actionGenerateSchemas - generated 파일 생성", async () => {
      const result = await (syncer as any).actionGenerateSchemas();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      expect(steps).toContain("actionGenerateSchemas");
      Naite.expect("step").toMatchSnapshot();
    });
  });

  // ============================================
  // 10. handleEntityChange
  // ============================================
  describe("handleEntityChange", () => {
    test("entity 변경 시 generated 파일 추가", async () => {
      const diffGroups = {
        entity: [join(apiRootPath, "src/application/user/user.entity.json") as AbsolutePath],
        types: [],
        functions: [],
        generated: [],
        model: [],
        frame: [],
        config: [],
      };
      const diffTypes: string[] = ["entity"];

      await syncer.handleEntityChange(diffGroups, diffTypes);

      expect(diffGroups.generated).toBeDefined();
      expect(diffGroups.generated.length).toBeGreaterThan(0);
      expect(diffTypes).toContain("generated");
    });

    test("handleEntityChange - EntityManager reload 호출", async () => {
      await syncer.handleEntityChange(
        {
          entity: [join(apiRootPath, "src/application/user/user.entity.ts") as AbsolutePath],
          types: [],
          functions: [],
          generated: [],
          model: [],
          frame: [],
          config: [],
        },
        ["entity"],
      );

      const handleEntityChangeData = Naite.get("handleEntityChange");
      expect(handleEntityChangeData).toBeDefined();
      expect(handleEntityChangeData.diffGroups).toBeDefined();
    });

    test("handleEntityChange - step 스냅샷", async () => {
      await syncer.handleEntityChange(
        {
          entity: [join(apiRootPath, "src/application/user/user.entity.ts") as AbsolutePath],
          types: [],
          functions: [],
          generated: [],
          model: [],
          frame: [],
          config: [],
        },
        ["types"],
      );

      Naite.expect("step").toMatchSnapshot();
    });
  });

  // ============================================
  // 11. handleModelOrFrameChange
  // ============================================
  describe("handleModelOrFrameChange", () => {
    test("여러 model 동시 처리", async () => {
      const diffGroups = {
        model: [
          join(apiRootPath, "src/application/user/user.model.ts") as AbsolutePath,
          join(apiRootPath, "src/application/project/project.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      };

      await syncer.handleModelOrFrameChange(diffGroups);

      const actionGenerateServicesData = Naite.get("actionGenerateServices");
      expect(actionGenerateServicesData).toBeDefined();
      expect(actionGenerateServicesData.length).toBe(2);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("autoload 순서: models → types → apis", async () => {
      await syncer.handleModelOrFrameChange({
        model: [join(apiRootPath, "src/application/user/user.model.ts") as AbsolutePath],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

      const steps = Naite.get("step");
      const autoloadModelsIndex = steps.indexOf("autoloadModels");
      const autoloadTypesIndex = steps.indexOf("autoloadTypes");
      const autoloadApisIndex = steps.indexOf("autoloadApis");

      expect(autoloadModelsIndex).toBeGreaterThan(-1);
      expect(autoloadTypesIndex).toBeGreaterThan(autoloadModelsIndex);
      expect(autoloadApisIndex).toBeGreaterThan(autoloadTypesIndex);
    });

    test("http 파일 생성", async () => {
      await syncer.handleModelOrFrameChange({
        model: [join(apiRootPath, "src/application/user/user.model.ts") as AbsolutePath],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

      Naite.expect("step").toMatchSnapshot();
    });
  });

  // ============================================
  // 4. 템플릿 생성/변경 테스트
  // ============================================
  describe("템플릿 생성", () => {
    test("generateTemplate - service 생성", async () => {
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

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      // service 파일이 생성되었는지 확인
      const serviceFile = writeFilesArray.find((f: any) => f.file.includes("user.service.ts"));
      expect(serviceFile).toBeDefined();
    });

    test("generateTemplate - model scaffolding", async () => {
      await syncer.generateTemplate(
        "model",
        {
          entityId: "User",
        },
        {
          overwrite: true,
        },
      );

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("generateTemplate - init_types 생성", async () => {
      await syncer.generateTemplate(
        "init_types",
        {
          entityId: "User",
        },
        {
          overwrite: true,
        },
      );

      const writeFiles = Naite.get("fs:writeFile");
      expect(writeFiles).toBeDefined();

      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const typesFile = writeFilesArray.find((f: any) => f.file.includes("user.types.ts"));
      expect(typesFile).toBeDefined();
    });

    test("actionGenerateSchemas - generated 파일 생성", async () => {
      const result = await (syncer as any).actionGenerateSchemas();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const steps = Naite.get("step");
      expect(steps).toContain("actionGenerateSchemas");
    });

    test("actionGenerateServices - 파라미터 배열 처리", async () => {
      const params = [
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
        {
          namesRecord: {
            camel: "employee",
            camelPlural: "employees",
            capital: "Employee",
            capitalPlural: "Employees",
            constant: "EMPLOYEE",
            fs: "employee",
            fsPlural: "employees",
            upper: "EMPLOYEE",
          },
        },
      ];

      const result = await (syncer as any).actionGenerateServices(params);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 5. 파일 타입별 처리 테스트
  // ============================================
  describe("파일 타입별 처리", () => {
    test("handleTypesOrFunctionsOrGeneratedChange - types 파일 처리", async () => {
      const diffGroups = {
        types: [join(apiRootPath, "src/application/user/user.types.ts") as AbsolutePath],
        functions: [],
        generated: [],
        entity: [],
        model: [],
        frame: [],
        config: [],
      };

      await (syncer as any).handleTypesOrFunctionsOrGeneratedChange(diffGroups);

      const writeFiles = Naite.get("fs:writeFile");
      expect(writeFiles).toBeDefined();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);
    });

    test.todo("handleTypesOrFunctionsOrGeneratedChange - 여러 파일 동시 처리");

    test("actionSyncConfig - config 파일 동기화", async () => {
      await (syncer as any).actionSyncConfig();

      const writeFiles = Naite.get("fs:writeFile");

      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);
      const configFile = writeFilesArray.find((f: any) => f.file.includes(".sonamu.env"));
      expect(configFile).toBeDefined();

      // API_HOST와 API_PORT가 포함되어 있는지 확인
      expect(configFile.data).toContain("API_HOST");
      expect(configFile.data).toContain("API_PORT");
    });

    test("copyFileWithReplaceCoreToShared - import 경로 변환", async () => {
      // 실제로는 파일이 복사되지 않지만 (mock), writeFile이 호출되는지 확인
      const tsPaths = [join(apiRootPath, "src/application/user/user.types.ts") as AbsolutePath];
      console.log("tsPaths", tsPaths);
      await (syncer as any).actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs:writeFile");
      expect(writeFiles).toBeDefined();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      // 타겟 경로가 올바른지 확인 (api -> web, application -> services)
      const targetFile = writeFilesArray[0];
      expect(targetFile.file).toContain("/web/");
      expect(targetFile.file).toContain("/services/");
    });
  });

  // ============================================
  // 6. 에러 핸들링 테스트
  // ============================================
  describe("에러 핸들링", () => {
    test.todo("handleEntityChange - 존재하지 않는 entity 파일");

    test.todo("handleModelOrFrameChange - 잘못된 파일 경로");
  });

  // ============================================
  // 기타 유틸리티 테스트
  // ============================================
  describe("유틸리티", () => {
    test.todo("fs/promises mock is working");

    test.todo("checkExistsGenCode - 생성된 코드 존재 확인");

    test.todo("autoloadTypes - types 로드");

    test.todo("autoloadModels - models 로드");

    test.todo("autoloadApis - apis 로드");
  });
});

// 유틸 함수
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
      const pathStr = typeof path === "string" ? path : path.toString();

      if (virtualFileSystem.has(pathStr)) {
        return;
      }

      if (typeof path === "string" && path.endsWith("this-file-does-not-actually-exist.ts")) {
        return;
      }
      return actual.access(path, mode);
    }),
    mkdir: vi.fn(async (path: PathLike, options?: any): Promise<string | undefined> => {
      Naite.t("fs:mkdir", { path, options });
      if (options?.recursive) {
        return typeof path === "string" ? path : path.toString();
      }
      return undefined;
    }) as any,
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
              flush?: boolean | undefined;
            } & Abortable)
          | BufferEncoding
          | null,
      ): Promise<void> => {
        const filePath = typeof file === "string" ? file : file.toString();
        Naite.t("fs:writeFile", { file: filePath, data });
        virtualFileSystem.add(filePath);
        return Promise.resolve(undefined);
      },
    ),
    unlink: vi.fn(async (path: PathLike): Promise<void> => {
      const pathStr = typeof path === "string" ? path : path.toString();
      virtualFileSystem.delete(pathStr);
      return Promise.resolve(undefined);
    }),
  };
});
