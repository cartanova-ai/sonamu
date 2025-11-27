import type { Abortable } from "events";
import { constants, type Mode, type ObjectEncodingOptions, type OpenMode, type PathLike } from "fs";
import { access, type FileHandle } from "fs/promises";
import { join } from "path";
import { Naite, Sonamu } from "sonamu";
import type Stream from "stream";
import { beforeAll, beforeEach, describe, expect, vi } from "vitest";
import { AlreadyProcessedException } from "../../../../../modules/sonamu/dist/exceptions/so-exceptions";
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

    virtualFileSystem.clear();
  });

  // ============================================
  // 기본 Mock 테스트
  // ============================================
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
      expect(error.message).toBe("test error");
    } finally {
      expect(mockFn).toHaveBeenCalledWith("test.txt", 0);
      expect(mockFn).toHaveBeenCalledWith("test.txt", 1);
      expect(mockFn).toHaveBeenCalledTimes(2);
    }
    Naite.expect("vi.fn").toMatchSnapshot();
  });

  test.skip("fs/promises mock is working", async () => {
    // TODO: Naite.useMock과 vi.mock 통합 필요
    const filePath = join(apiRootPath, "this-file-does-not-actually-exist.ts");
    const mockFs = Naite.useMock("fs/promises");
    mockFs.when("access", [filePath]).returns();

    const isExists = await exists(filePath);
    expect(isExists).toBe(true);

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

  // ============================================
  // 1. 파일 변경 감지 워크플로우
  // ============================================
  describe("파일 변경 감지 워크플로우", () => {
    test("model 파일 변경 → http 재생성", async () => {
      const modelPath = join(apiRootPath, "src/application/user/user.model.ts") as AbsolutePath;

      await (syncer as any).doSyncActions([modelPath]);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const httpFile = writeFilesArray.find((f: any) => f.file.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      expect(steps).toContain("handleModelOrFrameChange");
      Naite.expect("step").toMatchSnapshot();
    });

    test("generated 파일 변경 → 타겟에 복사", async () => {
      const generatedPath = join(
        apiRootPath,
        "src/application/sonamu.generated.ts",
      ) as AbsolutePath;

      await (syncer as any).doSyncActions([generatedPath]);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const copiedFile = writeFilesArray.find(
        (f: any) => f.file.includes("/web/") && f.file.includes("sonamu.generated.ts"),
      );
      expect(copiedFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("여러 model 파일 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/user/user.model.ts"),
        join(apiRootPath, "src/application/project/project.model.ts"),
        join(apiRootPath, "src/application/company/company.model.ts"),
      ] as AbsolutePath[];

      await (syncer as any).doSyncActions(paths);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("model + types 파일 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/user/user.model.ts"),
        join(apiRootPath, "src/application/user/user.types.ts"),
        join(apiRootPath, "src/application/project/project.model.ts"),
        join(apiRootPath, "src/application/project/project.types.ts"),
      ] as AbsolutePath[];

      await (syncer as any).doSyncActions(paths);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(4);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("config 파일 변경 → .sonamu.env 재생성", async () => {
      const configPath = join(apiRootPath, "src/application/sonamu.config.ts") as AbsolutePath;

      await (syncer as any).doSyncActions([configPath]);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const envFile = writeFilesArray.find((f: any) => f.file.includes(".sonamu.env"));
      expect(envFile).toBeDefined();
      expect(envFile.data).toContain("API_HOST=");
      expect(envFile.data).toContain("API_PORT=");

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });
  });

  // ============================================
  // 2. overwrite 옵션 테스트
  // ============================================
  describe("overwrite 옵션", () => {
    beforeEach(() => {
      virtualFileSystem.clear();
    });

    test("overwrite: true - 항상 파일 생성", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "TestEntity",
          title: "테스트 엔티티",
          table: "test_entities",
        },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("overwrite: false - 파일 존재 시 AlreadyProcessedException", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "User",
          title: "사용자",
          table: "users",
        },
        { overwrite: true },
      );

      const firstWriteFiles = Naite.get("fs:writeFile");
      const firstWriteFilesArray = Array.isArray(firstWriteFiles)
        ? firstWriteFiles
        : [firstWriteFiles];
      const targetFile = firstWriteFilesArray.find((f: any) => f.file.includes("user.entity.json"));
      expect(targetFile).toBeDefined();

      const targetFilePath = targetFile.file;

      try {
        virtualFileSystem.add(targetFilePath);

        await expect(
          syncer.generateTemplate(
            "entity",
            {
              entityId: "User",
              title: "사용자",
              table: "users",
            },
            { overwrite: false },
          ),
        ).rejects.toThrow(AlreadyProcessedException);
      } finally {
        virtualFileSystem.delete(targetFilePath);
      }
    });

    test("overwrite: false - 파일 미존재 시 정상 생성", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "NewEntity",
          title: "새 엔티티",
          table: "new_entities",
        },
        { overwrite: false },
      );

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("overwrite: true - 파일 존재해도 덮어쓰기", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "OverwriteTest",
          title: "덮어쓰기 테스트",
          table: "overwrite_tests",
        },
        { overwrite: true },
      );

      const firstWriteFiles = Naite.get("fs:writeFile");
      const firstWriteFilesArray = Array.isArray(firstWriteFiles)
        ? firstWriteFiles
        : [firstWriteFiles];
      const targetFile = firstWriteFilesArray.find((f: any) =>
        f.file.includes("overwrite-test.entity.json"),
      );
      const targetFilePath = targetFile.file;

      virtualFileSystem.add(targetFilePath);

      Naite.createStore().clear();

      await syncer.generateTemplate(
        "entity",
        {
          entityId: "OverwriteTest",
          title: "덮어쓰기 테스트 (수정)",
          table: "overwrite_tests",
        },
        { overwrite: true },
      );

      const secondWriteFiles = Naite.get("fs:writeFile");
      const secondWriteFilesArray = Array.isArray(secondWriteFiles)
        ? secondWriteFiles
        : [secondWriteFiles];
      const newFile = secondWriteFilesArray.find((f: any) =>
        f.file.includes("overwrite-test.entity.json"),
      );

      expect(newFile).toBeDefined();

      virtualFileSystem.delete(targetFilePath);
    });

    test("entity 템플릿 - parentId 옵션", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "UserProfile",
          title: "사용자 프로필",
          parentId: "User",
          table: "user_profiles",
        },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });
  });

  // ============================================
  // 3. 템플릿 타입별 테스트
  // ============================================
  describe("템플릿 타입", () => {
    test("entity 템플릿", async () => {
      await syncer.generateTemplate(
        "entity",
        { title: "User", entityId: "User" },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const entityFile = writeFilesArray.find((f: any) => f.file.includes(".entity.json"));
      expect(entityFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("model 템플릿", async () => {
      await syncer.generateTemplate("model", { entityId: "User" }, { overwrite: true });

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      expect(steps).toContain("generateTemplate");
      Naite.expectWithSnapshot("step");
    });

    test("init_types 템플릿", async () => {
      await syncer.generateTemplate("init_types", { entityId: "User" }, { overwrite: true });

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const typesFile = writeFilesArray.find((f: any) => f.file.includes("user.types.ts"));
      expect(typesFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      expect(steps).toContain("generateTemplate");
      expect(steps).toContain("renderTemplate");
      Naite.expect("step").toMatchSnapshot();
    });

    test("generated 템플릿", async () => {
      await syncer.generateTemplate("generated", {}, { overwrite: true });

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const generatedFile = writeFilesArray.find((f: any) =>
        f.file.includes("sonamu.generated.ts"),
      );
      expect(generatedFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      expect(steps).toContain("generateTemplate");
      Naite.expect("step").toMatchSnapshot();
    });

    test("generated_sso 템플릿", async () => {
      await syncer.generateTemplate("generated_sso", {}, { overwrite: true });

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const generatedSsoFile = writeFilesArray.find((f: any) =>
        f.file.includes("sonamu.generated.sso.ts"),
      );
      expect(generatedSsoFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("generated_http 템플릿", async () => {
      await syncer.generateTemplate("generated_http", { entityId: "User" }, { overwrite: true });

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const httpFile = writeFilesArray.find((f: any) => f.file.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("model_test 템플릿", async () => {
      await syncer.generateTemplate("model_test", { entityId: "User" }, { overwrite: true });

      const writeFiles = Naite.get("fs:writeFile");
      expect(writeFiles).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test.skip("view_list 템플릿", async () => {
      // Biome lint 에러로 스킵
      await syncer.generateTemplate(
        "view_list",
        { entityId: "User", extra: undefined },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs:writeFile");
      expect(writeFiles).toBeDefined();
    });
  });

  // ============================================
  // 4. 파일 경로 변환
  // ============================================
  describe("파일 경로 변환", () => {
    test("api → web 경로 변환", async () => {
      const tsPaths = [join(apiRootPath, "src/application/user/user.types.ts") as AbsolutePath];

      await (syncer as any).actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const targetFile = writeFilesArray[0];

      expect(targetFile.file).toContain("/web/");
      expect(targetFile.file).not.toContain("/api/");
      expect(targetFile.file).toContain("/services/");
      expect(targetFile.file).not.toContain("/application/");
      expect(targetFile.file).toContain("user.types.ts");
    });

    test("import 경로 변환", async () => {
      const tsPaths = [join(apiRootPath, "src/application/user/user.types.ts") as AbsolutePath];

      await (syncer as any).actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const targetFile = writeFilesArray[0];

      if (typeof targetFile.data === "string") {
        expect(targetFile.data).not.toContain('from "sonamu"');
      }
    });

    test("여러 types 파일 동시 동기화", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/user/user.types.ts") as AbsolutePath,
        join(apiRootPath, "src/application/project/project.types.ts") as AbsolutePath,
      ];

      await (syncer as any).actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // 5. 네이밍 컨벤션
  // ============================================
  describe("네이밍 컨벤션", () => {
    test("PascalCase entityId → kebab-case 파일명 변환", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "UserProfile",
          title: "사용자 프로필",
          table: "user_profiles",
        },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const entityFile = writeFilesArray.find((f: any) =>
        f.file.includes("user-profile.entity.json"),
      );

      expect(entityFile).toBeDefined();
      expect(entityFile.file).toContain("/user-profile/");
    });
  });

  // ============================================
  // 6. 에러 처리
  // ============================================
  describe("에러 처리", () => {
    test("존재하지 않는 Entity ID → 명확한 에러", async () => {
      await expect(
        syncer.generateTemplate("model", { entityId: "NonExistentEntity" }, { overwrite: true }),
      ).rejects.toThrow("존재하지 않는 모듈 패스 요청");
    });

    test("빈 배열 입력 → 정상 처리", async () => {
      const result = await (syncer as any).doSyncActions([]);
      expect(result.diffTypes).toBeDefined();
      expect(result.diffTypes.length).toBe(0);

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      expect(steps).toContain("doSyncActions");
      Naite.expect("step").toMatchSnapshot();
    });

    test("알 수 없는 파일 타입 → unknown 분류", async () => {
      const unknownPaths = [
        join(apiRootPath, "src/random/file.unknown"),
        join(apiRootPath, "src/random/file.txt"),
      ] as AbsolutePath[];

      const result = await (syncer as any).doSyncActions(unknownPaths);
      expect(result.diffTypes).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });
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

    test("handleEntityChange - step 검증", async () => {
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

      Naite.expectWithSnapshot("step");
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

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const httpFile = writeFilesArray.find((f: any) => f.file.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();
    });

    test("actionGenerateServices 파라미터 확인", async () => {
      await syncer.handleModelOrFrameChange({
        model: [join(apiRootPath, "src/application/user/user.model.ts") as AbsolutePath],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

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
    });
  });

  // ============================================
  // 12. 통합 시나리오
  // ============================================
  describe("통합 시나리오", () => {
    test("Entity 변경 → 전체 플로우", async () => {
      const entityPath = join(apiRootPath, "src/application/user/user.entity.json") as AbsolutePath;
      await (syncer as any).doSyncActions([entityPath]);

      const writeFiles = Naite.get("fs:writeFile");
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const generatedFile = writeFilesArray.find((f: any) => f.file.includes("sonamu.generated"));
      expect(generatedFile).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });

    test("Model + Entity 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/user/user.entity.json"),
        join(apiRootPath, "src/application/user/user.model.ts"),
      ] as AbsolutePath[];

      await (syncer as any).doSyncActions(paths);

      const writeFiles = Naite.get("fs:writeFile");
      expect(writeFiles).toBeDefined();

      const steps = Naite.get("step");
      expect(steps).toBeDefined();
      Naite.expect("step").toMatchSnapshot();
    });
  });

  // ============================================
  // 유틸리티 (TODO)
  // ============================================
  describe("유틸리티", () => {
    test.todo("checkExistsGenCode - 생성된 코드 존재 확인");
    test.todo("autoloadTypes - types 로드");
    test.todo("autoloadModels - models 로드");
    test.todo("autoloadApis - apis 로드");
  });
});

// ============================================
// 유틸 함수
// ============================================
async function exists(filePath: string) {
  if (virtualFileSystem.has(filePath)) {
    return true;
  }
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// 가상 파일 시스템 및 Mock 설정
// ============================================
const virtualFileSystem = new Set<string>();

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
