import assert from "assert";
import { join } from "path";
import { Naite, Sonamu } from "sonamu";
import { beforeAll, beforeEach, describe, expect, vi } from "vitest";
import {
  AlreadyProcessedException,
  BadRequestException,
} from "../../../../../modules/sonamu/dist/exceptions/so-exceptions";
import type { AbsolutePath } from "../../../../../modules/sonamu/dist/utils/path-utils";
import { bootstrap, test } from "../testing/bootstrap";

interface WriteFileRecord {
  path: string;
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

      const httpFile = writeFiles.find((f) => f.path.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(steps).toContain("handleModelOrFrameChange");
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("generated 파일 변경 → 타겟에 복사", async () => {
      const generatedPath = join(
        apiRootPath,
        "src/application/sonamu.generated.ts",
      ) as AbsolutePath;

      await syncer.doSyncActions([generatedPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();

      const copiedFile = writeFiles.find(
        (f: WriteFileRecord) => f.path.includes("/web/") && f.path.includes("sonamu.generated.ts"),
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
      expect(writeFiles.length).toBeGreaterThan(0);

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
      expect(writeFiles.length).toBeGreaterThan(4);

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("config 파일 변경 → .sonamu.env 재생성", async () => {
      const configPath = join(apiRootPath, "src/application/sonamu.config.ts") as AbsolutePath;

      await syncer.doSyncActions([configPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();

      const envFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".sonamu.env"));
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
      expect(writeFiles.length).toBeGreaterThan(0);

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
      const targetFile = firstWriteFiles.find((f: WriteFileRecord) =>
        f.path.includes("user.entity.json"),
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
      expect(writeFiles.length).toBeGreaterThan(0);

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
      const newFile = secondWriteFiles.find((f: WriteFileRecord) =>
        f.path.includes("overwrite-test.entity.json"),
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
      expect(writeFiles.length).toBeGreaterThan(0);

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
      const entityFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".entity.json"));
      expect(entityFile).toBeDefined();

      const steps = Naite.get("step").result();
      expect(steps).toBeDefined();
      expect(Naite.get("step").result()).toMatchSnapshot();
    });

    test("model 템플릿", async () => {
      await syncer.generateTemplate("model", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile:*").first().data;

      await expect(writeFile).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/model.test.ts.snap",
      );
    });

    test("init_types 템플릿", async () => {
      await syncer.generateTemplate("init_types", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const typesFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sync-fixture.types.ts"),
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
      const generatedFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated.ts"),
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
      const generatedSsoFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated.sso.ts"),
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
      const httpFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated.http"),
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
      const targetFile = writeFiles[0];

      expect(targetFile.path).toContain("/web/");
      expect(targetFile.path).not.toContain("/api/");
      expect(targetFile.path).toContain("/services/");
      expect(targetFile.path).not.toContain("/application/");
      expect(targetFile.path).toContain("sync-fixture.types.ts");
    });

    test("import 경로 변환", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      await syncer.actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const targetFile = writeFiles[0];

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
      expect(writeFiles.length).toBeGreaterThanOrEqual(2);
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
      const entityFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("user-profile.entity.json"),
      );

      expect(entityFile).toBeDefined();
      expect(entityFile.path).toContain("/user-profile/");
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
      const configFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".sonamu.env"));

      expect(configFile).toBeDefined();
      expect(configFile.data).toContain("API_HOST=");
      expect(configFile.data).toContain("API_PORT=");
    });

    test("config 값 정확성", async () => {
      await syncer.actionSyncConfig();

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const configFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".sonamu.env"));

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
      const httpFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated.http"),
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

      const generatedFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated"),
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
  // 15. copySharedToTargets
  // ============================================
  describe("copySharedToTargets", () => {
    test("정상 복사", async () => {
      const targets = Sonamu.config.sync.targets;

      await syncer.copySharedToTargets(targets);

      // 파일이 동일하면 복사 스킵될 수 있으므로 에러 없이 완료되면 성공
    });

    test("shared 소스 파일 미존재 → early return (에러 없음)", async () => {
      // nonexistent-target.shared.ts.txt가 sonamu에 없으므로 early return
      await expect(syncer.copySharedToTargets(["nonexistent-target"])).resolves.not.toThrow();
    });

    test("빈 타겟 배열 → 정상 처리", async () => {
      await syncer.copySharedToTargets([]);
      // 에러 없이 완료되어야 함
    });
  });

  // ============================================
  // 17. entity-operations
  // ============================================
  describe("entity-operations", () => {
    describe("createEntity", () => {
      test("유효한 CamelCase entityId → 성공", async () => {
        await syncer.createEntity({
          entityId: "ValidTestEntity",
          title: "Valid Test Entity",
          table: "valid_test_entities",
        });

        const writeFiles = Naite.get("fs/promises:writeFile").result();

        const entityFile = writeFiles.find((f: WriteFileRecord) =>
          f.path.includes("valid-test-entity.entity.json"),
        );
        expect(entityFile).toBeDefined();
      });

      test("잘못된 entityId - snake_case → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalid_entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      test("잘못된 entityId - camelCase (소문자 시작) → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalidEntity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      test("잘못된 entityId - kebab-case → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalid-entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      test("잘못된 entityId - 숫자로 시작 → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "123Entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      test("숫자 포함 CamelCase → 성공", async () => {
        await syncer.createEntity({
          entityId: "Entity2Test",
          title: "Entity 2 Test",
          table: "entity2_tests",
        });

        const writeFiles = Naite.get("fs/promises:writeFile").result();

        const entityFile = writeFiles.find((f: WriteFileRecord) =>
          f.path.includes("entity2-test.entity.json"),
        );
        expect(entityFile).toBeDefined();
      });
    });

    describe("delEntity", () => {
      test("루트 엔티티 삭제 → 디렉토리 전체 삭제", async () => {
        const result = await syncer.delEntity("SyncFixture");

        expect(result.delPaths).toBeDefined();
        expect(result.delPaths.length).toBeGreaterThan(0);

        // rm 호출 확인
        const rmCalls = Naite.get("fs/promises:rm").result();

        expect(rmCalls.some((r) => r.path.includes("sync-fixture"))).toBe(true);
      });

      test("존재하지 않는 엔티티 → 에러", async () => {
        await expect(syncer.delEntity("NonExistentEntity")).rejects.toThrow();
      });
    });
  });
  // ============================================
  // 18. checkExistsGenCode
  // ============================================
  describe("checkExistsGenCode", () => {
    test("존재하는 entity 템플릿 확인", async () => {
      const result = await syncer.checkExistsGenCode("SyncFixture", "entity");

      expect(result).toBeDefined();
      expect(result.subPath).toBeDefined();
      expect(result.fullPath).toBeDefined();
      expect(result.isExists).toBe(true); // 실제로 존재하므로 true
    });

    test("존재하는 model 템플릿 확인", async () => {
      const result = await syncer.checkExistsGenCode("SyncFixture", "model");

      expect(result).toBeDefined();
      expect(result.subPath).toContain("sync-fixture");
      expect(result.isExists).toBe(true); // 실제로 존재하므로 true
    });

    test("존재하지 않는 entityId → isExists: false 반환", async () => {
      const result = await syncer.checkExistsGenCode("NonExistentEntity", "entity");

      expect(result).toBeDefined();
      expect(result.isExists).toBe(false); // 에러가 아니라 false 반환
      expect(result.subPath).toContain("non-existent-entity");
    });

    test("다양한 템플릿 키", async () => {
      const templateKeys = ["entity", "model", "init_types", "service"] as const;

      for (const key of templateKeys) {
        const result = await syncer.checkExistsGenCode("SyncFixture", key);
        expect(result).toBeDefined();
        expect(typeof result.isExists).toBe("boolean");
      }
    });
  });

  // ============================================
  // 20. autoload 유틸리티
  // ============================================
  describe("autoload 유틸리티", () => {
    describe("autoloadTypes", () => {
      test("types 로드 후 syncer.types에 저장", async () => {
        await syncer.autoloadTypes();

        expect(syncer.types).toBeDefined();
        expect(typeof syncer.types).toBe("object");
      });

      test("로드된 types는 ZodObject 형태", async () => {
        await syncer.autoloadTypes();

        for (const [_key, value] of Object.entries(syncer.types)) {
          expect(value).toBeDefined();
          // Zod 스키마는 _def 속성을 가짐
          expect("_def" in (value as object)).toBe(true);
        }
      });
    });

    describe("autoloadModels", () => {
      test("models 로드 후 syncer.models에 저장", async () => {
        await syncer.autoloadModels();

        expect(syncer.models).toBeDefined();
        expect(typeof syncer.models).toBe("object");
      });

      test("로드된 models는 Model/Frame 클래스 인스턴스", async () => {
        await syncer.autoloadModels();

        for (const [key, _value] of Object.entries(syncer.models)) {
          expect(key.endsWith("Model") || key.endsWith("Frame")).toBe(true);
        }
      });
    });

    describe("autoloadApis", () => {
      /*
       * autoloadApis는 @api 데코레이터가 실행된 후에만 동작함.
       * 테스트 환경에서 모듈 캐싱으로 인해 데코레이터가 재실행되지 않아 직접 테스트 불가.
       *
       * 간접 테스트:
       * - "handleModelOrFrameChange > autoload 순서: models → types → apis"
       * - "handleModelOrFrameChange > actionGenerateServices 파라미터 확인"
       */
      test.skip("apis 로드 후 syncer.apis에 저장 (handleModelOrFrameChange에서 간접 검증)", async () => {});
      test.skip("로드된 apis는 LoadedApis 형태 (handleModelOrFrameChange에서 간접 검증)", async () => {});
    });
  });

  // ============================================
  // 21. 파일 스냅샷 테스트 확장
  // ============================================
  describe("파일 스냅샷", () => {
    test("generated.ts 전체 출력", async () => {
      await syncer.generateTemplate("generated", {}, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sonamu.generated.ts"));

      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/generated.ts.snap",
      );
    });

    test("entity.json 구조", async () => {
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "SnapshotTest",
          title: "스냅샷 테스트용",
          table: "snapshot_tests",
        },
        { overwrite: true },
      );

      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("snapshot-test.entity.json"));

      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/entity.json.snap",
      );
    });

    test("init_types.ts 생성", async () => {
      await syncer.generateTemplate("init_types", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sync-fixture.types.ts"));

      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/init_types.ts.snap",
      );
    });

    test("generated.http 출력", async () => {
      await syncer.generateTemplate(
        "generated_http",
        { entityId: "SyncFixture" },
        { overwrite: true },
      );

      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sonamu.generated.http"));

      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/generated.http.snap",
      );
    });

    test("generated_sso.ts 출력", async () => {
      await syncer.generateTemplate("generated_sso", {}, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sonamu.generated.sso.ts"));

      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/generated_sso.ts.snap",
      );
    });

    test("types.ts 복사 후 import 변환", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      await syncer.actionSyncFilesToTargets(tsPaths);

      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("/web/") && f.path.includes(".types.ts"));

      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/copied-types.ts.snap",
      );
    });
  });
});
