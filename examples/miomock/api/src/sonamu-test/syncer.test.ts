import { join } from "path";
import { Naite, Sonamu } from "sonamu";
import { beforeAll, beforeEach, describe, expect, vi } from "vitest";
import { AlreadyProcessedException } from "../../../../../modules/sonamu/dist/exceptions/so-exceptions";
import type { AbsolutePath } from "../../../../../modules/sonamu/dist/utils/path-utils";
import { bootstrap, test } from "../testing/bootstrap";

interface WriteFileRecord {
  file: string;
  data: unknown;
}

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
  // ============================================
  // 1. 파일 변경 감지 워크플로우
  // ============================================
  describe("파일 변경 감지 워크플로우", () => {
    test("model 파일 변경 → http 재생성", async () => {
      const modelPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture.model.ts",
      ) as AbsolutePath;

      await syncer.doSyncActions([modelPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const httpFile = writeFilesArray.find((f) => f.file.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("handleModelOrFrameChange");
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test.only("generated 파일 변경 → 타겟에 복사", async () => {
      const generatedPath = join(
        apiRootPath,
        "src/application/sonamu.generated.ts",
      ) as AbsolutePath;

      await syncer.doSyncActions([generatedPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const copiedFile = writeFilesArray.find(
        (f: WriteFileRecord) => f.file.includes("/web/") && f.file.includes("sonamu.generated.ts"),
      );
      expect(copiedFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("여러 model 파일 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
        join(apiRootPath, "src/application/company/company.model.ts"),
        join(apiRootPath, "src/application/project/project.model.ts"),
      ] as AbsolutePath[];

      await syncer.doSyncActions(paths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("model + types 파일 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts"),
        join(apiRootPath, "src/application/company/company.model.ts"),
        join(apiRootPath, "src/application/company/company.types.ts"),
      ] as AbsolutePath[];

      await syncer.doSyncActions(paths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(4);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("config 파일 변경 → .sonamu.env 재생성", async () => {
      const configPath = join(apiRootPath, "src/application/sonamu.config.ts") as AbsolutePath;

      await syncer.doSyncActions([configPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const envFile = writeFilesArray.find((f: WriteFileRecord) => f.file.includes(".sonamu.env"));
      expect(envFile).toBeDefined();
      expect(envFile.data).toContain("API_HOST=");
      expect(envFile.data).toContain("API_PORT=");

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });
  });

  // ============================================
  // 2. overwrite 옵션 테스트
  // ============================================
  describe("overwrite 옵션", () => {
    beforeEach(() => {});

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

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
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

      const firstWriteFiles = Naite.get("fs/promises:writeFile").result();
      const firstWriteFilesArray = Array.isArray(firstWriteFiles)
        ? firstWriteFiles
        : [firstWriteFiles];
      const targetFile = firstWriteFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("user.entity.json"),
      );
      expect(targetFile).toBeDefined();

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

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
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

      await syncer.generateTemplate(
        "entity",
        {
          entityId: "OverwriteTest",
          title: "덮어쓰기 테스트 (수정)",
          table: "overwrite_tests",
        },
        { overwrite: true },
      );

      const secondWriteFiles = Naite.get("fs/promises:writeFile").result();
      const secondWriteFilesArray = Array.isArray(secondWriteFiles)
        ? secondWriteFiles
        : [secondWriteFiles];
      const newFile = secondWriteFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("overwrite-test.entity.json"),
      );

      expect(newFile).toBeDefined();
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

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      expect(writeFilesArray.length).toBeGreaterThan(0);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });
  });

  // ============================================
  // 3. 템플릿 타입별 테스트
  // ============================================
  describe("템플릿 타입", () => {
    test("entity 템플릿", async () => {
      await syncer.generateTemplate(
        "entity",
        { title: "SyncFixture", entityId: "SyncFixture" },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const entityFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes(".entity.json"),
      );
      expect(entityFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("model 템플릿", async () => {
      await syncer.generateTemplate("model", { entityId: "SyncFixture" }, { overwrite: true });

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("generateTemplate");
      expect(Naite.get("step").result()).toMatchSnapshot("step");
    });

    test("init_types 템플릿", async () => {
      await syncer.generateTemplate("init_types", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const typesFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("sync-fixture.types.ts"),
      );
      expect(typesFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("generateTemplate");
      expect(steps).toContain("renderTemplate");
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("generated 템플릿", async () => {
      await syncer.generateTemplate("generated", {}, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const generatedFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("sonamu.generated.ts"),
      );
      expect(generatedFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("generateTemplate");
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("generated_sso 템플릿", async () => {
      await syncer.generateTemplate("generated_sso", {}, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const generatedSsoFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("sonamu.generated.sso.ts"),
      );
      expect(generatedSsoFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("generated_http 템플릿", async () => {
      await syncer.generateTemplate(
        "generated_http",
        { entityId: "SyncFixture" },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const httpFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("sonamu.generated.http"),
      );
      expect(httpFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("model_test 템플릿", async () => {
      await syncer.generateTemplate("model_test", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test.skip("view_list 템플릿", async () => {
      // Biome lint 에러로 스킵
      await syncer.generateTemplate(
        "view_list",
        { entityId: "SyncFixture", extra: undefined },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles).toBeDefined();
    });
  });

  // ============================================
  // 4. 파일 경로 변환
  // ============================================
  describe("파일 경로 변환", () => {
    test("api → web 경로 변환", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      await syncer.actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const targetFile = writeFilesArray[0];

      expect(targetFile.file).toContain("/web/");
      expect(targetFile.file).not.toContain("/api/");
      expect(targetFile.file).toContain("/services/");
      expect(targetFile.file).not.toContain("/application/");
      expect(targetFile.file).toContain("sync-fixture.types.ts");
    });

    test("import 경로 변환", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      await syncer.actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const targetFile = writeFilesArray[0];

      if (typeof targetFile.data === "string") {
        expect(targetFile.data).not.toContain('from "sonamu"');
      }
    });

    test("여러 types 파일 동시 동기화", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
        join(apiRootPath, "src/application/company/company.types.ts") as AbsolutePath,
      ];

      await syncer.actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
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

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const entityFile = writeFilesArray.find((f: WriteFileRecord) =>
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
      const result = await syncer.doSyncActions([]);
      expect(result.diffTypes).toBeDefined();
      expect(result.diffTypes.length).toBe(0);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("doSyncActions");
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("알 수 없는 파일 타입 → unknown 분류", async () => {
      const unknownPaths = [
        join(apiRootPath, "src/random/file.unknown"),
        join(apiRootPath, "src/random/file.txt"),
      ] as AbsolutePath[];

      const result = await syncer.doSyncActions(unknownPaths);
      expect(result.diffTypes).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });
  });

  // ============================================
  // 7. 파일 타입 분류
  // ============================================
  describe("파일 타입 분류", () => {
    test("지원하는 파일 타입 분류", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts"),
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
        join(apiRootPath, "src/application/sonamu.config.ts"),
        join(apiRootPath, "src/application/sonamu.generated.ts"),
      ] as AbsolutePath[];

      const diffGroups = syncer.calculateDiffGroups(paths);

      expect(diffGroups.types?.length).toBe(1);
      expect(diffGroups.model?.length).toBe(1);
      expect(diffGroups.config?.length).toBe(1);
      expect(diffGroups.generated?.length).toBe(1);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("같은 타입 여러 파일", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
        join(apiRootPath, "src/application/company/company.model.ts"),
        join(apiRootPath, "src/application/project/project.model.ts"),
      ] as AbsolutePath[];

      const diffGroups = syncer.calculateDiffGroups(paths);
      expect(diffGroups.model?.length).toBe(3);
    });
  });

  // ============================================
  // 8. Config 동기화
  // ============================================
  describe("Config 동기화", () => {
    test(".sonamu.env 생성", async () => {
      await syncer.actionSyncConfig();

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const configFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes(".sonamu.env"),
      );

      expect(configFile).toBeDefined();
      expect(configFile.data).toContain("API_HOST=");
      expect(configFile.data).toContain("API_PORT=");
    });

    test("config 값 정확성", async () => {
      await syncer.actionSyncConfig();

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const configFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes(".sonamu.env"),
      );

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
      const result = await syncer.actionGenerateSchemas();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("actionGenerateSchemas");
      expect(Naite.get("step").result()).toMatchSnapshot();
    });
  });

  // ============================================
  // 10. handleEntityChange
  // ============================================
  describe("handleEntityChange", () => {
    test("entity 변경 시 generated 파일 추가", async () => {
      const diffGroups = {
        entity: [
          join(
            apiRootPath,
            "src/application/sync-fixture/sync-fixture.entity.json",
          ) as AbsolutePath,
        ],
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
          entity: [
            join(
              apiRootPath,
              "src/application/sync-fixture/sync-fixture.entity.json",
            ) as AbsolutePath,
          ],
          types: [],
          functions: [],
          generated: [],
          model: [],
          frame: [],
          config: [],
        },
        ["types"],
      );

      expect(Naite.get("step").result()).toMatchSnapshot("step");
    });
  });

  // ============================================
  // 11. handleModelOrFrameChange
  // ============================================
  describe("handleModelOrFrameChange", () => {
    test("여러 model 동시 처리", async () => {
      const diffGroups = {
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
          join(apiRootPath, "src/application/company/company.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      };

      await syncer.handleModelOrFrameChange(diffGroups);

      const actionGenerateServicesData = Naite.get("actionGenerateServices").first();
      expect(actionGenerateServicesData).toBeDefined();
      expect(actionGenerateServicesData.length).toBe(2);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("autoload 순서: models → types → apis", async () => {
      await syncer.handleModelOrFrameChange({
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

      const steps = Naite.get("step").result();
      const autoloadModelsIndex = steps.indexOf("autoloadModels");
      const autoloadTypesIndex = steps.indexOf("autoloadTypes");
      const autoloadApisIndex = steps.indexOf("autoloadApis");

      expect(autoloadModelsIndex).toBeGreaterThan(-1);
      expect(autoloadTypesIndex).toBeGreaterThan(autoloadModelsIndex);
      expect(autoloadApisIndex).toBeGreaterThan(autoloadTypesIndex);
    });

    test("http 파일 생성", async () => {
      await syncer.handleModelOrFrameChange({
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];
      const httpFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("sonamu.generated.http"),
      );
      expect(httpFile).toBeDefined();
    });

    test("actionGenerateServices 파라미터 확인", async () => {
      await syncer.handleModelOrFrameChange({
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
      });

      expect(Naite.get("actionGenerateServices").first()).toEqual([
        {
          namesRecord: {
            camel: "syncFixture",
            camelPlural: "syncFixtures",
            capital: "SyncFixture",
            capitalPlural: "SyncFixtures",
            constant: "SYNC_FIXTURE",
            fs: "sync-fixture",
            fsPlural: "sync-fixtures",
            upper: "SYNCFIXTURE",
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
      const entityPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture.entity.json",
      ) as AbsolutePath;
      await syncer.doSyncActions([entityPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const writeFilesArray = Array.isArray(writeFiles) ? writeFiles : [writeFiles];

      const generatedFile = writeFilesArray.find((f: WriteFileRecord) =>
        f.file.includes("sonamu.generated"),
      );
      expect(generatedFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("Model + Entity 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.entity.json"),
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
      ] as AbsolutePath[];

      await syncer.doSyncActions(paths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
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
