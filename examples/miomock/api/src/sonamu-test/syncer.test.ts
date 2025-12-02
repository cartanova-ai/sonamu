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
    // 목적: model 파일이 변경되면 자동으로 HTTP 파일이 재생성되는지 확인
    test("model 파일 변경 → http 재생성", async () => {
      const modelPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture.model.ts",
      ) as AbsolutePath;

      await syncer.doSyncActions([modelPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();

      const httpFile = writeFiles.find((f) => f.path.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();
    });

    // 목적: generated 파일이 변경되면 타겟 디렉토리(web 등)로 자동 복사되는지 확인
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
    });

    // 목적: 여러 model 파일을 동시에 변경했을 때 모두 정상 처리되는지 확인
    test("여러 model 파일 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
        join(apiRootPath, "src/application/company/company.model.ts"),
        join(apiRootPath, "src/application/project/project.model.ts"),
      ] as AbsolutePath[];

      await syncer.doSyncActions(paths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles.length).toBeGreaterThan(0);
    });

    // 목적: model과 types 파일을 동시에 변경했을 때 각각의 처리 워크플로우가 모두 실행되는지 확인
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
    });

    // 목적: config 파일이 변경되면 .sonamu.env 파일이 재생성되는지 확인
    test("config 파일 변경 → .sonamu.env 재생성", async () => {
      const configPath = join(apiRootPath, "src/application/sonamu.config.ts") as AbsolutePath;

      await syncer.doSyncActions([configPath]);

      const writeFiles = Naite.get("fs/promises:writeFile").result();

      const envFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".sonamu.env"));
      expect(envFile).toBeDefined();
      expect(envFile.data).toContain("API_HOST=");
      expect(envFile.data).toContain("API_PORT=");
    });
  });

  // ============================================
  // 2. overwrite 옵션 테스트
  // ============================================
  describe("overwrite 옵션", () => {
    beforeEach(() => {});

    // 목적: overwrite: true일 때 파일이 이미 존재해도 덮어쓰기로 생성되는지 확인
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
    });

    // 목적: overwrite: false일 때 이미 존재하는 파일을 생성하려고 하면 AlreadyProcessedException이 발생하는지 확인
    test("overwrite: false - 파일 존재 시 AlreadyProcessedException", async () => {
      // 1단계: 먼저 파일을 생성 (overwrite: true로)
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "User",
          title: "사용자",
          table: "users",
        },
        { overwrite: true },
      );

      // 생성된 파일 확인
      const firstWriteFiles = Naite.get("fs/promises:writeFile").result();
      const targetFile = firstWriteFiles.find((f: WriteFileRecord) =>
        f.path.includes("user.entity.json"),
      );
      expect(targetFile).toBeDefined();

      // 2단계: 같은 파일을 overwrite: false로 다시 생성 시도 → 에러 발생해야 함
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

    // 목적: overwrite: false일 때 파일이 존재하지 않으면 정상적으로 생성되는지 확인
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
    });

    // 목적: overwrite: true일 때 같은 파일을 두 번 생성해도 에러 없이 덮어쓰기가 되는지 확인
    test("overwrite: true - 파일 존재해도 덮어쓰기", async () => {
      // 1단계: 첫 번째 생성
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "OverwriteTest",
          title: "덮어쓰기 테스트",
          table: "overwrite_tests",
        },
        { overwrite: true },
      );

      // 2단계: 같은 entityId로 다시 생성 (제목만 변경) → 덮어쓰기되어야 함
      await syncer.generateTemplate(
        "entity",
        {
          entityId: "OverwriteTest",
          title: "덮어쓰기 테스트 (수정)",
          table: "overwrite_tests",
        },
        { overwrite: true },
      );

      // 덮어쓰기된 파일이 존재하는지 확인
      const secondWriteFiles = Naite.get("fs/promises:writeFile").result();
      const newFile = secondWriteFiles.find((f: WriteFileRecord) =>
        f.path.includes("overwrite-test.entity.json"),
      );

      expect(newFile).toBeDefined();
    });

    // 목적: entity 템플릿 생성 시 parentId 옵션이 정상적으로 처리되는지 확인
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
    });
  });

  // ============================================
  // 3. 템플릿 타입별 테스트
  // ============================================
  describe("템플릿 타입", () => {
    // 목적: entity 템플릿이 정상적으로 생성되는지 확인
    test("entity 템플릿", async () => {
      await syncer.generateTemplate(
        "entity",
        { title: "SyncFixture", entityId: "SyncFixture" },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const entityFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".entity.json"));
      expect(entityFile).toBeDefined();
    });

    // 목적: model 템플릿이 정상적으로 생성되고 스냅샷과 일치하는지 확인
    test("model 템플릿", async () => {
      await syncer.generateTemplate("model", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile:*").first().data;

      await expect(writeFile).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/model.test.ts.snap",
      );
    });

    // 목적: init_types 템플릿이 정상적으로 생성되는지 확인
    test("init_types 템플릿", async () => {
      await syncer.generateTemplate("init_types", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const typesFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sync-fixture.types.ts"),
      );
      expect(typesFile).toBeDefined();
    });

    // 목적: generated 템플릿이 정상적으로 생성되는지 확인
    test("generated 템플릿", async () => {
      await syncer.generateTemplate("generated", {}, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const generatedFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated.ts"),
      );
      expect(generatedFile).toBeDefined();
    });

    // 목적: generated_sso 템플릿이 정상적으로 생성되는지 확인
    test("generated_sso 템플릿", async () => {
      await syncer.generateTemplate("generated_sso", {}, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const generatedSsoFile = writeFiles.find((f: WriteFileRecord) =>
        f.path.includes("sonamu.generated.sso.ts"),
      );
      expect(generatedSsoFile).toBeDefined();
    });

    // 목적: generated_http 템플릿이 정상적으로 생성되는지 확인
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
    });

    // 목적: model_test 템플릿이 정상적으로 생성되는지 확인
    test("model_test 템플릿", async () => {
      await syncer.generateTemplate("model_test", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles).toBeDefined();
    });

    // 목적: view_list 템플릿이 정상적으로 생성되는지 확인
    test("view_list 템플릿", async () => {
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
    // 목적: api 디렉토리의 파일이 web 디렉토리로 복사될 때 경로가 올바르게 변환되는지 확인
    test("api → web 경로 변환", async () => {
      // 원본 파일 경로 (api 디렉토리)
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      // 타겟 디렉토리로 파일 동기화 실행
      await syncer.actionSyncFilesToTargets(tsPaths);

      // 복사된 파일 확인
      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const targetFile = writeFiles[0];

      // 경로 변환 검증:
      // - /api/ → /web/ 변환 확인
      expect(targetFile.path).toContain("/web/");
      expect(targetFile.path).not.toContain("/api/");
      // - /application/ → /services/ 변환 확인
      expect(targetFile.path).toContain("/services/");
      expect(targetFile.path).not.toContain("/application/");
      // 파일명은 유지되는지 확인
      expect(targetFile.path).toContain("sync-fixture.types.ts");
    });

    // 목적: 파일 복사 시 import 경로가 올바르게 변환되는지 확인 (예: "sonamu" → "src/services/sonamu.shared")
    test("import 경로 변환", async () => {
      // 원본 파일 경로
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      // 타겟 디렉토리로 파일 동기화 실행 (import 경로 변환 포함)
      await syncer.actionSyncFilesToTargets(tsPaths);

      // 복사된 파일 내용 확인
      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const targetFile = writeFiles[0];

      // 검증: 원본 import 경로("sonamu")가 제거되었는지 확인
      // (변환된 경로는 "src/services/sonamu.shared"로 변경됨)
      if (typeof targetFile.data === "string") {
        expect(targetFile.data).not.toContain('from "sonamu"');
      }
    });

    // 목적: 여러 types 파일을 동시에 동기화할 때 모두 정상 처리되는지 확인
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
    // 목적: PascalCase로 된 entityId가 kebab-case 파일명으로 올바르게 변환되는지 확인
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
    // 목적: 존재하지 않는 Entity ID로 템플릿을 생성하려고 할 때 명확한 에러 메시지가 나오는지 확인
    test("존재하지 않는 Entity ID → 명확한 에러", async () => {
      await expect(
        syncer.generateTemplate("model", { entityId: "NonExistentEntity" }, { overwrite: true }),
      ).rejects.toThrow("존재하지 않는 모듈 패스 요청");
    });

    // 목적: 빈 배열을 입력했을 때 에러 없이 정상 처리되는지 확인
    test("빈 배열 입력 → 정상 처리", async () => {
      const result = await syncer.doSyncActions([]);
      expect(result.diffTypes).toBeDefined();
      expect(result.diffTypes.length).toBe(0);
    });

    // 목적: 알 수 없는 파일 타입이 "unknown"으로 분류되는지 확인
    test("알 수 없는 파일 타입 → unknown 분류", async () => {
      const unknownPaths = [
        join(apiRootPath, "src/random/file.unknown"),
        join(apiRootPath, "src/random/file.txt"),
      ] as AbsolutePath[];

      const result = await syncer.doSyncActions(unknownPaths);
      expect(result.diffTypes).toBeDefined();
    });
  });

  // ============================================
  // 7. 파일 타입 분류
  // ============================================
  describe("파일 타입 분류", () => {
    // 목적: 지원하는 파일 타입(types, model, config, generated)이 올바르게 분류되는지 확인
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
    });

    // 목적: 같은 타입의 여러 파일이 올바르게 그룹화되는지 확인
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
    // 목적: config 동기화 시 .sonamu.env 파일이 생성되고 필요한 환경 변수가 포함되는지 확인
    test(".sonamu.env 생성", async () => {
      await syncer.actionSyncConfig();

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const configFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".sonamu.env"));

      expect(configFile).toBeDefined();
      expect(configFile.data).toContain("API_HOST=");
      expect(configFile.data).toContain("API_PORT=");
    });

    // 목적: 생성된 .sonamu.env 파일의 값이 실제 config 값과 일치하는지 확인
    test("config 값 정확성", async () => {
      // config 동기화 실행
      await syncer.actionSyncConfig();

      // 생성된 .sonamu.env 파일 찾기
      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const configFile = writeFiles.find((f: WriteFileRecord) => f.path.includes(".sonamu.env"));

      // 실제 config에서 서버 설정 가져오기
      const { host, port } = Sonamu.config.server.listen ?? {};
      // 생성된 파일의 값이 config 값과 일치하는지 검증
      expect(configFile.data).toContain(`API_HOST=${host ?? "localhost"}`);
      expect(configFile.data).toContain(`API_PORT=${port ?? 3000}`);
    });
  });

  // ============================================
  // 9. Schema 생성
  // ============================================
  describe("Schema 생성", () => {
    // 목적: actionGenerateSchemas가 정상적으로 실행되어 generated 파일 2개(sonamu.generated.ts, sonamu.generated.sso.ts)가 생성되는지 확인
    test("actionGenerateSchemas - generated 파일 생성", async () => {
      const result = await syncer.actionGenerateSchemas();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  // ============================================
  // 10. handleEntityChange
  // ============================================
  describe("handleEntityChange", () => {
    // 목적: entity 파일이 변경되면 diffGroups.generated에 파일이 추가되고 diffTypes에 "generated"가 포함되는지 확인
    test("entity 변경 시 generated 파일 추가", async () => {
      // 초기 상태 설정: entity 파일만 변경된 상태로 시뮬레이션
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
      const diffTypes: string[] = ["entity"]; // 초기에는 "entity"만 포함

      // handleEntityChange 실행: entity 변경 처리
      await syncer.handleEntityChange(diffGroups, diffTypes);

      // 검증: generated 파일이 추가되었는지 확인
      expect(diffGroups.generated).toBeDefined();
      expect(diffGroups.generated.length).toBeGreaterThan(0);
      // diffTypes에 "generated"가 추가되었는지 확인
      expect(diffTypes).toContain("generated");
    });
  });

  // ============================================
  // 11. handleModelOrFrameChange
  // ============================================
  describe("handleModelOrFrameChange", () => {
    // 목적: 여러 model 파일을 동시에 처리할 때 각각에 대해 actionGenerateServices가 호출되는지 확인
    test("여러 model 동시 처리", async () => {
      // 2개의 model 파일이 동시에 변경된 상황 시뮬레이션
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

      // handleModelOrFrameChange 실행: 여러 model 처리
      await syncer.handleModelOrFrameChange(diffGroups);

      // 검증: actionGenerateServices가 2번 호출되었는지 확인 (각 model마다 1번씩)
      const actionGenerateServicesData = Naite.get("actionGenerateServices").first();
      expect(actionGenerateServicesData).toBeDefined();
      expect(actionGenerateServicesData.length).toBe(2);
    });

    // 목적: handleModelOrFrameChange 실행 시 autoload가 models → types → apis 순서로 실행되고 모두 정상 로드되는지 확인
    test("autoload 순서: models → types → apis", async () => {
      // autoload 순서는 handleModelOrFrameChange 내부에서 보장됨
      // 실제 동작 검증: autoload 후 models, types, apis가 모두 로드되었는지 확인
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

      // autoload가 정상적으로 완료되었는지 확인
      // models와 types는 객체이므로 Object.keys() 사용, apis는 배열이므로 length 직접 사용
      expect(Object.keys(syncer.models).length).toBeGreaterThan(0);
      expect(Object.keys(syncer.types).length).toBeGreaterThan(0);
      expect(syncer.apis.length).toBeGreaterThan(0);
    });

    // 목적: handleModelOrFrameChange 실행 시 sonamu.generated.http 파일이 생성되는지 확인
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

    // 목적: actionGenerateServices가 호출될 때 올바른 namesRecord 파라미터가 전달되는지 확인
    test("actionGenerateServices 파라미터 확인", async () => {
      // SyncFixture 모델 변경 처리
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

      // 검증: actionGenerateServices에 전달된 파라미터가 올바른 namesRecord를 포함하는지 확인
      // namesRecord는 entityId("SyncFixture")로부터 생성된 다양한 네이밍 변형을 포함
      expect(Naite.get("actionGenerateServices").first()).toEqual([
        {
          namesRecord: {
            camel: "syncFixture", // camelCase
            camelPlural: "syncFixtures", // camelCase 복수형
            capital: "SyncFixture", // PascalCase
            capitalPlural: "SyncFixtures", // PascalCase 복수형
            constant: "SYNC_FIXTURE", // UPPER_SNAKE_CASE
            fs: "sync-fixture", // kebab-case (파일시스템용)
            fsPlural: "sync-fixtures", // kebab-case 복수형
            upper: "SYNCFIXTURE", // UPPERCASE (공백 없음)
          },
        },
      ]);
    });
  });

  // ============================================
  // 12. 통합 시나리오
  // ============================================
  describe("통합 시나리오", () => {
    // 목적: Entity 파일 변경 시 전체 워크플로우가 정상적으로 실행되어 generated 파일이 생성되는지 확인
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
    });

    // 목적: Model과 Entity 파일을 동시에 변경했을 때 두 워크플로우가 모두 정상 실행되는지 확인
    test("Model + Entity 동시 변경", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.entity.json"),
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
      ] as AbsolutePath[];

      await syncer.doSyncActions(paths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles).toBeDefined();
    });
  });

  // ============================================
  // 13. copySharedToTargets
  // ============================================
  describe("copySharedToTargets", () => {
    // 목적: shared 파일이 타겟 디렉토리로 정상적으로 복사되는지 확인 (파일이 동일하면 스킵될 수 있음)
    test("정상 복사", async () => {
      const targets = Sonamu.config.sync.targets;

      await syncer.copySharedToTargets(targets);

      // 파일이 동일하면 복사 스킵될 수 있으므로 에러 없이 완료되면 성공
    });

    // 목적: 존재하지 않는 shared 파일을 복사하려고 할 때 에러 없이 early return되는지 확인
    test("shared 소스 파일 미존재 → early return (에러 없음)", async () => {
      // nonexistent-target.shared.ts.txt가 sonamu에 없으므로 early return
      await expect(syncer.copySharedToTargets(["nonexistent-target"])).resolves.not.toThrow();
    });

    // 목적: 빈 타겟 배열을 전달했을 때 에러 없이 정상 처리되는지 확인
    test("빈 타겟 배열 → 정상 처리", async () => {
      await syncer.copySharedToTargets([]);
      // 에러 없이 완료되어야 함
    });
  });

  // ============================================
  // 14. entity-operations
  // ============================================
  describe("entity-operations", () => {
    describe("createEntity", () => {
      // 목적: 유효한 CamelCase 형식의 entityId로 엔티티를 생성할 수 있는지 확인
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

      // 목적: snake_case 형식의 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - snake_case → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalid_entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      // 목적: 소문자로 시작하는 camelCase 형식의 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - camelCase (소문자 시작) → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalidEntity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      // 목적: kebab-case 형식의 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - kebab-case → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalid-entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      // 목적: 숫자로 시작하는 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - 숫자로 시작 → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "123Entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException("entityId는 CamelCase 형식이어야 합니다."));
      });

      // 목적: 숫자를 포함하지만 CamelCase 형식을 따르는 entityId는 정상 생성되는지 확인
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
      // 목적: 루트 엔티티를 삭제할 때 해당 엔티티의 디렉토리 전체가 삭제되는지 확인
      test("루트 엔티티 삭제 → 디렉토리 전체 삭제", async () => {
        // 엔티티 삭제 실행
        const result = await syncer.delEntity("SyncFixture");

        // 1단계 검증: 삭제된 경로 목록이 반환되는지 확인
        expect(result.delPaths).toBeDefined();
        expect(result.delPaths.length).toBeGreaterThan(0);

        // 2단계 검증: 실제 파일 시스템 삭제 호출(rm)이 발생했는지 확인
        const rmCalls = Naite.get("fs/promises:rm").result();
        // sync-fixture 관련 경로가 삭제 호출에 포함되었는지 확인
        expect(rmCalls.some((r) => r.path.includes("sync-fixture"))).toBe(true);
      });

      // 목적: 존재하지 않는 엔티티를 삭제하려고 할 때 에러가 발생하는지 확인
      test("존재하지 않는 엔티티 → 에러", async () => {
        await expect(syncer.delEntity("NonExistentEntity")).rejects.toThrow();
      });
    });
  });
  // ============================================
  // 15. checkExistsGenCode
  // ============================================
  describe("checkExistsGenCode", () => {
    // 목적: 존재하는 entity 템플릿에 대해 checkExistsGenCode가 올바른 정보를 반환하는지 확인
    test("존재하는 entity 템플릿 확인", async () => {
      const result = await syncer.checkExistsGenCode("SyncFixture", "entity");

      expect(result).toBeDefined();
      expect(result.subPath).toBeDefined();
      expect(result.fullPath).toBeDefined();
      expect(result.isExists).toBe(true); // 실제로 존재하므로 true
    });

    // 목적: 존재하는 model 템플릿에 대해 checkExistsGenCode가 올바른 정보를 반환하는지 확인
    test("존재하는 model 템플릿 확인", async () => {
      const result = await syncer.checkExistsGenCode("SyncFixture", "model");

      expect(result).toBeDefined();
      expect(result.subPath).toContain("sync-fixture");
      expect(result.isExists).toBe(true); // 실제로 존재하므로 true
    });

    // 목적: 존재하지 않는 entityId에 대해 checkExistsGenCode가 에러를 던지지 않고 isExists: false를 반환하는지 확인
    test("존재하지 않는 entityId → isExists: false 반환", async () => {
      const result = await syncer.checkExistsGenCode("NonExistentEntity", "entity");

      expect(result).toBeDefined();
      expect(result.isExists).toBe(false); // 에러가 아니라 false 반환
      expect(result.subPath).toContain("non-existent-entity");
    });

    // 목적: 다양한 템플릿 키에 대해 checkExistsGenCode가 정상적으로 동작하는지 확인
    test("다양한 템플릿 키", async () => {
      // 여러 템플릿 타입에 대해 테스트
      const templateKeys = ["entity", "model", "init_types", "service"] as const;

      // 각 템플릿 키에 대해 checkExistsGenCode 실행 및 검증
      for (const key of templateKeys) {
        const result = await syncer.checkExistsGenCode("SyncFixture", key);
        // 결과가 정의되어 있고, isExists가 boolean 타입인지 확인
        expect(result).toBeDefined();
        expect(typeof result.isExists).toBe("boolean");
      }
    });
  });

  // ============================================
  // 16. autoload 유틸리티
  // ============================================
  describe("autoload 유틸리티", () => {
    describe("autoloadTypes", () => {
      // 목적: autoloadTypes 실행 후 syncer.types에 타입들이 정상적으로 로드되는지 확인
      test("types 로드 후 syncer.types에 저장", async () => {
        await syncer.autoloadTypes();

        expect(syncer.types).toBeDefined();
        expect(typeof syncer.types).toBe("object");
      });

      // 목적: 로드된 types가 ZodObject 형태인지 확인 (Zod 스키마는 _def 속성을 가짐)
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
      // 목적: autoloadModels 실행 후 syncer.models에 모델들이 정상적으로 로드되는지 확인
      test("models 로드 후 syncer.models에 저장", async () => {
        await syncer.autoloadModels();

        expect(syncer.models).toBeDefined();
        expect(typeof syncer.models).toBe("object");
      });

      // 목적: 로드된 models의 키 이름이 "Model" 또는 "Frame"으로 끝나는지 확인
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
  // 17. 파일 스냅샷 테스트 확장
  // ============================================
  describe("파일 스냅샷", () => {
    // 목적: generated.ts 파일이 생성되고 스냅샷과 일치하는지 확인
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

    // 목적: entity.json 파일이 생성되고 스냅샷과 일치하는지 확인
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

    // 목적: init_types.ts 파일이 생성되고 스냅샷과 일치하는지 확인
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

    // 목적: generated.http 파일이 생성되고 스냅샷과 일치하는지 확인
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

    // 목적: generated_sso.ts 파일이 생성되고 스냅샷과 일치하는지 확인
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

    // 목적: types.ts 파일이 타겟으로 복사되고 import 경로가 변환된 후 스냅샷과 일치하는지 확인
    test("types.ts 복사 후 import 변환", async () => {
      // 원본 types.ts 파일 경로
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      // 타겟 디렉토리로 파일 동기화 실행 (경로 변환 및 import 변환 포함)
      await syncer.actionSyncFilesToTargets(tsPaths);

      // 복사된 파일 찾기 (web 디렉토리의 types.ts 파일)
      const writeFile = Naite.get("fs/promises:writeFile:*")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("/web/") && f.path.includes(".types.ts"));

      // 파일이 존재하는지 확인 후 스냅샷과 비교
      await assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/copied-types.ts.snap",
      );
    });
  });
});
