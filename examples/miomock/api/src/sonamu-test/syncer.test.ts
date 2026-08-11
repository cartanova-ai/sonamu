import assert from "assert";
import { join } from "path";
import { pathToFileURL } from "url";

import { type EntityJson, type EntityProp, type TemplateKey, type TemplateOptions } from "sonamu";
import { getEnumDefValues, Naite, registeredApis, Sonamu, Template } from "sonamu";
import { bootstrap, test } from "sonamu/test";
import { beforeAll, beforeEach, describe, expect, vi } from "vitest";

import { SD } from "../../../../../modules/sonamu/dist/dict/sd";
import { type EntityNamesRecord } from "../../../../../modules/sonamu/dist/entity/entity-manager";
import {
  AlreadyProcessedException,
  BadRequestException,
} from "../../../../../modules/sonamu/dist/exceptions/so-exceptions";
import * as SyncerActions from "../../../../../modules/sonamu/dist/syncer/syncer-actions";
import { type RenderedTemplate } from "../../../../../modules/sonamu/dist/template/template";
import { TemplateManager } from "../../../../../modules/sonamu/dist/template/template-manager";
import { type AbsolutePath } from "../../../../../modules/sonamu/dist/utils/path-utils";
import { mockTemplateManagerGet } from "../testing/test-helpers";

interface WriteFileRecord {
  path: string;
  data: unknown;
}

// 테스트용 타입 정의
type CustomTemplateKey = string & {};

type EntityData = EntityJson;

type WriteFile = {
  path: string;
  data: string;
};

type RegisteredApi = (typeof registeredApis)[number];

function createRegisteredApi(modelName: string, methodName: string): RegisteredApi {
  return {
    modelName,
    methodName,
    path: `/${modelName}/${methodName}`,
    options: {
      httpMethod: "GET",
      contentType: "application/json",
      clients: ["axios"],
    },
  };
}

// Mock Template 클래스 (테스트용)
class MockTemplateClass extends Template {
  constructor(
    key: TemplateKey | CustomTemplateKey,
    private mockRender: (
      options: TemplateOptions[TemplateKey] | Record<string, unknown>,
      ...extra: unknown[]
    ) => RenderedTemplate | Promise<RenderedTemplate>,
    private mockGetTargetAndPath: (
      names?: EntityNamesRecord,
      ...extra: unknown[]
    ) => {
      target: string;
      path: string;
    },
  ) {
    super(key as TemplateKey);
  }

  render(
    options: TemplateOptions[TemplateKey],
    ...extra: unknown[]
  ): RenderedTemplate | Promise<RenderedTemplate> {
    return this.mockRender(options, ...extra);
  }

  getTargetAndPath(
    names?: EntityNamesRecord,
    ...extra: unknown[]
  ): {
    target: string;
    path: string;
  } {
    return this.mockGetTargetAndPath(names, ...extra);
  }
}

bootstrap(vi, { forTesting: false });

describe("Syncer", () => {
  let apiRootPath: string;
  let syncer: typeof Sonamu.syncer;

  beforeAll(async () => {
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
      const webRootPath = join(apiRootPath, "../web");
      // entry-server.generated.tsx는 부트스트랩 phase 전용이라 doSyncActions에선 만들어지지 않습니다.
      // sonamu.generated.http는 api 측 REST client 도구용 자산이라 분배되지 않습니다.
      // sonamu.generated.sso.ts는 service-side-only invariant이라 target에 분배되지 않습니다 (api에만 정본).
      // queries.generated.ts는 SSR 디스크립터 헬퍼로 api/src/ssr/routes.ts 전용이라 target에 분배되지 않습니다.
      // sonamu.generated.ts(schemas)만 양쪽-필요 자산이라 api 정본 + web 복사 둘 다 만들어집니다.
      // sonamu.validators.generated.ts는 validation.zodCompiler.api opt-in 상태에서만 생성되는
      // HTTP validator registry이며, API 서버 전용이라 target에 분배되지 않습니다.
      expect(writeFiles.map((f) => f.path).toSorted()).toStrictEqual([
        join(apiRootPath, "src/application/queries.generated.ts"),
        join(apiRootPath, "src/application/sonamu.generated.http"),
        join(apiRootPath, "src/application/sonamu.generated.sso.ts"),
        join(apiRootPath, "src/application/sonamu.generated.ts"),
        join(apiRootPath, "src/application/sonamu.validators.generated.ts"),
        join(webRootPath, "src/services/company/company.types.ts"),
        join(webRootPath, "src/services/services.generated.ts"),
        join(webRootPath, "src/services/sonamu.generated.ts"),
        join(webRootPath, "src/services/sync-fixture/sync-fixture.types.ts"),
      ]);
      expect(writeFiles.length).toBeGreaterThanOrEqual(2);
    });

    // 목적: config 파일이 변경되면 .sonamu.env 파일이 재생성되는지 확인
    test("config 파일 변경 → .sonamu.env 재생성", async () => {
      const configPath = join(apiRootPath, "src/sonamu.config.ts") as AbsolutePath;

      await syncer.doSyncActions([configPath]);

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile.path).toContain(".sonamu.env");
      expect(writeFile.data).toContain("API_HOST=");
      expect(writeFile.data).toContain("API_PORT=");
    });
  });

  // ============================================
  // 2. hmrAndSync - Watcher 이벤트 처리
  // sonamu 패키지 내부에서 import하므로 vi.mock 적용 안됨 skip 처리
  // ============================================
  describe("hmrAndSync", () => {
    // 목적: model 파일 변경 시 doSyncActions가 호출되어 http 파일이 생성되고, autoload가 실행되어 모듈이 재로드되는지 확인
    test("change 이벤트 (model 파일) → 파일 생성 및 모듈 재로드", async () => {
      const modelPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture.model.ts",
      ) as AbsolutePath;

      await syncer.hmrAndSync(new Map([[modelPath, "change"]]));

      // 1. doSyncActions가 호출되어 http 파일이 생성되었는지 확인
      const writeFiles = Naite.get("fs/promises:writeFile").result();

      const httpFile = writeFiles.find((f) => f.path.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();

      // 2. autoload가 실행되어 모듈이 실제로 재로드되었는지 확인
      expect(Object.keys(syncer.models).length).toBeGreaterThan(0);
      expect(Object.keys(syncer.types).length).toBeGreaterThan(0);
      expect(syncer.apis.length).toBeGreaterThan(0);
    });

    // 목적: types 파일 추가 시 doSyncActions가 호출되어 타겟 디렉토리로 복사되는지 확인
    test("add 이벤트 (types 파일) → 타겟 디렉토리로 복사", async () => {
      const newTypesPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture.types.ts",
      ) as AbsolutePath;

      await syncer.hmrAndSync(new Map([[newTypesPath, "add"]]));

      // types 파일이 타겟 디렉토리(web)로 복사되었는지 확인
      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const copiedFile = writeFiles.find(
        (f: WriteFileRecord) =>
          f.path.includes("/web/") && f.path.includes("sync-fixture.types.ts"),
      );
      expect(copiedFile).toBeDefined();

      // autoload가 실행되어 types가 재로드되었는지 확인
      expect(Object.keys(syncer.types).length).toBeGreaterThan(0);
    });
  });

  // ============================================
  // 3. overwrite 옵션 테스트
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

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile).toBeDefined();
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
      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile.path).toContain("user.entity.json");

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

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile).toBeDefined();
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
      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile.path).toContain("overwrite-test.entity.json");
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

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile).toBeDefined();
    });
  });

  // ============================================
  // 4. 템플릿 타입별 테스트
  // ============================================
  describe("템플릿 타입", () => {
    // 목적: entity 템플릿이 정상적으로 생성되고 JSON 구조가 올바른지 확인
    test("entity 템플릿", async () => {
      await syncer.generateTemplate(
        "entity",
        { title: "SyncFixture", entityId: "SyncFixture" },
        { overwrite: true },
      );

      const writeFile = Naite.get("fs/promises:writeFile").first();
      // JSON 파일이 생성되었는지 확인
      expect(writeFile.path).toContain("sync-fixture.entity.json");
      // JSON 구조가 올바른지 확인 (entityId, title, table 등 필수 필드 포함)
      if (typeof writeFile.data === "string") {
        const entityData = JSON.parse(writeFile.data);
        expect(entityData.id).toBe("SyncFixture");
        expect(entityData.title).toBe("SyncFixture");
        expect(entityData.table).toBeDefined();
        expect(Array.isArray(entityData.props)).toBe(true);
      }
    });

    // 목적: model 템플릿이 정상적으로 생성되고 Model 클래스가 포함되어 있는지 확인
    test("model 템플릿", async () => {
      await syncer.generateTemplate("model", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile").first();
      // .model.ts 파일이 생성되었는지 확인
      expect(writeFile.path).toContain("sync-fixture.model.ts");
      // Model 클래스가 포함되어 있는지 확인
      if (typeof writeFile.data === "string") {
        expect(writeFile.data).toContain("class");
        expect(writeFile.data).toContain("SyncFixtureModel");
        expect(writeFile.data).toContain("BaseModelClass");
        // import 문이 포함되어 있는지 확인
        expect(writeFile.data).toContain("import");

        // findMany 기본 파라미터 적용시 satisfies 적용되어 있는지 확인
        expect(writeFile.data).toContain("satisfies SyncFixtureListParams");
      }
    });

    // 목적: init_types 템플릿이 정상적으로 생성되고 Zod 스키마가 포함되어 있는지 확인
    test("init_types 템플릿", async () => {
      await syncer.generateTemplate("init_types", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile").first();
      // .types.ts 파일이 생성되었는지 확인
      expect(writeFile.path).toContain("sync-fixture.types.ts");
      // Zod 스키마와 타입 정의가 포함되어 있는지 확인
      if (typeof writeFile.data === "string") {
        expect(writeFile.data).toContain("zod");
        expect(writeFile.data).toContain("SyncFixtureListParams");
        expect(writeFile.data).toContain("SyncFixtureSaveParams");
        expect(writeFile.data).toContain("export const");
        expect(writeFile.data).toContain("export type");
      }
    });

    // 목적: generated 템플릿이 정상적으로 생성되고 모든 엔티티의 스키마가 포함되어 있는지 확인
    test("generated 템플릿", async () => {
      await syncer.generateTemplate("generated", {}, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile").first();
      // sonamu.generated.ts 파일이 생성되었는지 확인
      expect(writeFile.path).toContain("sonamu.generated.ts");
      // 스키마 정의가 포함되어 있는지 확인
      if (typeof writeFile.data === "string") {
        expect(writeFile.data).toContain("BaseSchema");
        expect(writeFile.data).toContain("export const");
        expect(writeFile.data).toContain("export type");
      }
    });

    // 목적: generated_sso 템플릿이 정상적으로 생성되고 SSO 관련 코드가 포함되어 있는지 확인
    test("generated_sso 템플릿", async () => {
      await syncer.generateTemplate("generated_sso", {}, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile").first();
      // sonamu.generated.sso.ts 파일이 생성되었는지 확인
      expect(writeFile.path).toContain("sonamu.generated.sso.ts");
      // SSO 관련 쿼리가 포함되어 있는지 확인
      if (typeof writeFile.data === "string") {
        expect(writeFile.data).toContain("export const");
        expect(writeFile.data).toContain("SubsetQueries");
        expect(writeFile.data).toContain("LoaderQueries");
      }
    });

    // 목적: generated_http 템플릿이 정상적으로 생성되고 HTTP 요청 형식이 포함되어 있는지 확인
    test("generated_http 템플릿", async () => {
      await syncer.generateTemplate(
        "generated_http",
        { entityId: "SyncFixture" },
        { overwrite: true },
      );

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      const httpFile = writeFiles.find((f) => f.path.includes("sonamu.generated.http"));
      expect(httpFile).toBeDefined();

      // 요청 형식이 포함되어 있는지 확인
      if (typeof httpFile.data === "string") {
        expect(httpFile.data).toMatch(/^(GET|POST|PUT|DELETE|PATCH)\s+/m);
      }
    });

    // 목적: model_test 템플릿이 정상적으로 생성되고 테스트 파일이 생성되는지 확인
    test("model_test 템플릿", async () => {
      await syncer.generateTemplate("model_test", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile").first();
      // .test.ts 파일이 생성되었는지 확인
      expect(writeFile.path).toContain("sync-fixture.model.test.ts");
      // 테스트 코드가 포함되어 있는지 확인
      if (typeof writeFile.data === "string") {
        expect(writeFile.data).toContain("describe");
        expect(writeFile.data).toContain("test");
      }
    });

    // 목적: view_list 템플릿이 정상적으로 생성되고 뷰 파일이 생성되는지 확인
    test("view_list 템플릿", async () => {
      await syncer.generateTemplate(
        "view_list",
        { entityId: "SyncFixture", extra: undefined },
        { overwrite: true },
      );

      const writeFilesPaths = Naite.get("fs/promises:writeFile")
        .result()
        .map((f) => f.path);

      // expectedFiles의 모든 항목이 writeFilesPaths 중 적어도 하나에 포함되어 있는지 체크
      const expectedFiles = ["index.tsx"];

      // 모든 expectedFile이 writeFilesPaths 중 적어도 하나에 포함되어야 함
      const allFilesExist = expectedFiles.every((f) =>
        writeFilesPaths.some((path) => path.endsWith(f)),
      );
      expect(allFilesExist).toBe(true);
    });
  });

  // ============================================
  // 5. 파일 경로 변환
  // ============================================
  describe("파일 경로 변환", () => {
    // 목적: api 디렉토리의 파일이 web 디렉토리로 복사될 때 경로가 올바르게 변환되는지 확인
    test("api → web 경로 변환", async () => {
      // 원본 파일 경로 (api 디렉토리)
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      // 타겟 디렉토리로 파일 동기화 실행
      await SyncerActions.actionSyncFilesToTargets(tsPaths);

      // 복사된 파일 확인
      const writeFile = Naite.get("fs/promises:writeFile").first();

      // 경로 변환 검증:
      // - /api/ → /web/ 변환 확인
      expect(writeFile.path).toContain("/web/");
      expect(writeFile.path).not.toContain("/api/");
      // - /application/ → /services/ 변환 확인
      expect(writeFile.path).toContain("/services/");
      expect(writeFile.path).not.toContain("/application/");
      // 파일명은 유지되는지 확인
      expect(writeFile.path).toContain("sync-fixture.types.ts");
    });

    // 목적: 파일 복사 시 import 경로가 올바르게 변환되는지 확인 (예: "sonamu" → "src/services/sonamu.shared")
    test("import 경로 변환", async () => {
      // 원본 파일 경로
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
      ];

      // 타겟 디렉토리로 파일 동기화 실행 (import 경로 변환 포함)
      await SyncerActions.actionSyncFilesToTargets(tsPaths);

      // 복사된 파일 내용 확인
      const writeFile = Naite.get("fs/promises:writeFile").first();

      // 검증: 원본 import 경로("sonamu")가 제거되었는지 확인
      // (변환된 경로는 "src/services/sonamu.shared"로 변경됨)
      if (typeof writeFile.data === "string") {
        expect(writeFile.data).not.toContain('from "sonamu"');
      }
    });

    // 목적: 여러 types 파일을 동시에 동기화할 때 모두 정상 처리되는지 확인
    test("여러 types 파일 동시 동기화", async () => {
      const tsPaths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts") as AbsolutePath,
        join(apiRootPath, "src/application/company/company.types.ts") as AbsolutePath,
      ];

      await SyncerActions.actionSyncFilesToTargets(tsPaths);

      const writeFiles = Naite.get("fs/promises:writeFile").result();
      expect(writeFiles.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================
  // 6. 네이밍 컨벤션
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

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile.path).toContain("user-profile.entity.json");
      expect(writeFile.path).toContain("/user-profile/");
    });
  });

  // ============================================
  // 7. 에러 처리
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
  // 8. 파일 타입 분류
  // ============================================
  describe("파일 타입 분류", () => {
    // 목적: 지원하는 파일 타입(types, model, config, generated)이 올바르게 분류되는지 확인
    test("지원하는 파일 타입 분류", async () => {
      const paths = [
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.types.ts"),
        join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts"),
        join(apiRootPath, "src/sonamu.config.ts"),
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
  // 9. Config 동기화
  // ============================================
  describe("Config 동기화", () => {
    // 목적: config 동기화 시 .sonamu.env 파일이 생성되고 필요한 환경 변수가 포함되는지 확인
    test(".sonamu.env 생성", async () => {
      await SyncerActions.actionSyncConfig();

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile.path).toContain(".sonamu.env");
      expect(writeFile.data).toContain("API_HOST=");
      expect(writeFile.data).toContain("API_PORT=");
    });

    // 목적: 생성된 .sonamu.env 파일의 값이 실제 config 값과 일치하는지 확인
    test("config 값 정확성", async () => {
      // config 동기화 실행
      await SyncerActions.actionSyncConfig();

      // 생성된 .sonamu.env 파일 찾기
      const writeFile = Naite.get("fs/promises:writeFile").first();

      // 실제 config에서 서버 설정 가져오기
      const { host, port } = Sonamu.config.server.listen ?? {};
      // 생성된 파일의 값이 config 값과 일치하는지 검증
      expect(writeFile.path).toContain(".sonamu.env");
      expect(writeFile.data).toContain(`API_HOST=${host ?? "localhost"}`);
      expect(writeFile.data).toContain(`API_PORT=${port ?? 3000}`);
    });
  });

  // ============================================
  // 10. Schema 생성
  // ============================================
  describe("Schema 생성", () => {
    // 목적: actionGenerateSchemas가 정상적으로 실행되어 generated 파일 2개(sonamu.generated.ts, sonamu.generated.sso.ts)가 생성되는지 확인
    test("actionGenerateSchemas - generated 파일 생성", async () => {
      const result = await SyncerActions.actionGenerateSchemas();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
    });
  });

  // ============================================
  // 12. handleImplementationChanges
  // ============================================
  describe("handleImplementationChanges", () => {
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
        workflow: [],
        i18n: [],
        sdGenerated: [],
        generatedCopied: [],
        httpGenerated: [],
        servicesGenerated: [],
        typesCopied: [],
        functionsCopied: [],
        i18nCopied: [],
      };

      // handleImplementationChanges 실행: 여러 model 처리
      await syncer.handleImplementationChanges(diffGroups);

      // 검증: actionGenerateServices가 2번 호출되었는지 확인 (각 model마다 1번씩)
      const actionGenerateServicesData = Naite.get("actionGenerateServices").first();
      expect(actionGenerateServicesData).toBeDefined();
      expect(actionGenerateServicesData.length).toBe(2);
    });

    // 목적: handleImplementationChanges 실행 시 autoload가 models → types → apis 순서로 실행되고 모두 정상 로드되는지 확인
    test("autoload 순서: models → types → apis", async () => {
      // autoload 순서는 handleImplementationChanges 내부에서 보장됨
      // 실제 동작 검증: autoload 후 models, types, apis가 모두 로드되었는지 확인
      await syncer.handleImplementationChanges({
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
        workflow: [],
        i18n: [],
        sdGenerated: [],
        generatedCopied: [],
        httpGenerated: [],
        servicesGenerated: [],
        typesCopied: [],
        functionsCopied: [],
        i18nCopied: [],
      });

      // autoload가 정상적으로 완료되었는지 확인
      // models와 types는 객체이므로 Object.keys() 사용, apis는 배열이므로 length 직접 사용
      expect(Object.keys(syncer.models).length).toBeGreaterThan(0);
      expect(Object.keys(syncer.types).length).toBeGreaterThan(0);
      expect(syncer.apis.length).toBeGreaterThan(0);
    });

    // 목적: handleImplementationChanges 실행 시 sonamu.generated.http 파일이 생성되는지 확인
    test("http 파일 생성", async () => {
      await syncer.handleImplementationChanges({
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
        workflow: [],
        i18n: [],
        sdGenerated: [],
        generatedCopied: [],
        httpGenerated: [],
        servicesGenerated: [],
        typesCopied: [],
        functionsCopied: [],
        i18nCopied: [],
      });

      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f) => f.path.includes("sonamu.generated.http"));
      expect(writeFile).toBeDefined();
    });

    // 목적: actionGenerateServices가 호출될 때 올바른 namesRecord 파라미터가 전달되는지 확인
    test("actionGenerateServices 파라미터 확인", async () => {
      // SyncFixture 모델 변경 처리
      await syncer.handleImplementationChanges({
        model: [
          join(apiRootPath, "src/application/sync-fixture/sync-fixture.model.ts") as AbsolutePath,
        ],
        frame: [],
        types: [],
        functions: [],
        generated: [],
        entity: [],
        config: [],
        workflow: [],
        i18n: [],
        sdGenerated: [],
        generatedCopied: [],
        httpGenerated: [],
        servicesGenerated: [],
        typesCopied: [],
        functionsCopied: [],
        i18nCopied: [],
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

  describe("removeInvalidatedRegisteredApis", () => {
    test("sub model 변경 시 main model API를 제거하지 않는다", () => {
      const originalRegisteredApis = [...registeredApis];
      const invalidatedPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture-sub.model.ts",
      ) as AbsolutePath;

      registeredApis.length = 0;
      registeredApis.push(
        createRegisteredApi("SyncFixtureModel", "findById"),
        createRegisteredApi("SyncFixtureModel", "findMany"),
        createRegisteredApi("SyncFixtureSubModel", "findById"),
      );

      try {
        const removedApis = syncer.removeInvalidatedRegisteredApis(invalidatedPath);

        expect(removedApis.map((api) => `${api.modelName}.${api.methodName}`)).toStrictEqual([
          "SyncFixtureSubModel.findById",
        ]);
        expect(registeredApis.map((api) => `${api.modelName}.${api.methodName}`)).toStrictEqual([
          "SyncFixtureModel.findById",
          "SyncFixtureModel.findMany",
        ]);
      } finally {
        registeredApis.length = 0;
        registeredApis.push(...originalRegisteredApis);
      }
    });
  });

  // ============================================
  // 13. 통합 시나리오
  // ============================================
  describe("통합 시나리오", () => {
    // 목적: Entity 파일 변경 시 전체 워크플로우가 정상적으로 실행되어 generated 파일이 생성되는지 확인
    test("Entity 변경 → 전체 플로우", async () => {
      const entityPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture.entity.json",
      ) as AbsolutePath;
      await syncer.doSyncActions([entityPath]);

      const writeFile = Naite.get("fs/promises:writeFile").first();
      expect(writeFile.path).toContain("sonamu.generated");
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

        const writeFile = Naite.get("fs/promises:writeFile").first();
        expect(writeFile.path).toContain("valid-test-entity.entity.json");
      });

      // 목적: snake_case 형식의 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - snake_case → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalid_entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException(SD("sonamu.error.entityIdCamelCase")));
      });

      // 목적: 소문자로 시작하는 camelCase 형식의 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - camelCase (소문자 시작) → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalidEntity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException(SD("sonamu.error.entityIdCamelCase")));
      });

      // 목적: kebab-case 형식의 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - kebab-case → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "invalid-entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException(SD("sonamu.error.entityIdCamelCase")));
      });

      // 목적: 숫자로 시작하는 entityId는 BadRequestException이 발생하는지 확인
      test("잘못된 entityId - 숫자로 시작 → BadRequestException", async () => {
        await expect(
          syncer.createEntity({
            entityId: "123Entity",
            title: "Invalid",
            table: "invalid",
          }),
        ).rejects.toThrowError(new BadRequestException(SD("sonamu.error.entityIdCamelCase")));
      });

      // 목적: 숫자를 포함하지만 CamelCase 형식을 따르는 entityId는 정상 생성되는지 확인
      test("숫자 포함 CamelCase → 성공", async () => {
        await syncer.createEntity({
          entityId: "Entity2Test",
          title: "Entity 2 Test",
          table: "entity2_tests",
        });

        const writeFile = Naite.get("fs/promises:writeFile").first();
        expect(writeFile.path).toContain("entity2-test.entity.json");
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
  // 16. checkExistsGenCode
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
      const templateKeys = ["entity", "model", "init_types", "services"] as const;

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
  // 17. autoload 유틸리티
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
       * - "handleImplementationChanges > autoload 순서: models → types → apis"
       * - "handleImplementationChanges > actionGenerateServices 파라미터 확인"
       */
      test.skip("apis 로드 후 syncer.apis에 저장 (handleImplementationChanges에서 간접 검증)", async () => {});
      test.skip("로드된 apis는 LoadedApis 형태 (handleImplementationChanges에서 간접 검증)", async () => {});
    });
  });

  // ============================================
  // 18. 파일 스냅샷 테스트 확장
  // ============================================
  describe("파일 스냅샷", () => {
    // 목적: generated.ts 파일이 생성되고 스냅샷과 일치하는지 확인
    test("generated.ts 전체 출력", async () => {
      await syncer.generateTemplate("generated", {}, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sonamu.generated.ts"));

      assert(writeFile);
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

      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("snapshot-test.entity.json"));

      assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/entity.json.snap",
      );
    });

    // 목적: init_types.ts 파일이 생성되고 스냅샷과 일치하는지 확인
    test("init_types.ts 생성", async () => {
      await syncer.generateTemplate("init_types", { entityId: "SyncFixture" }, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sync-fixture.types.ts"));

      assert(writeFile);
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

      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sonamu.generated.http"));

      assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/generated.http.snap",
      );
    });

    // 목적: generated_sso.ts 파일이 생성되고 스냅샷과 일치하는지 확인
    test("generated_sso.ts 출력", async () => {
      await syncer.generateTemplate("generated_sso", {}, { overwrite: true });

      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("sonamu.generated.sso.ts"));

      assert(writeFile);
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
      await SyncerActions.actionSyncFilesToTargets(tsPaths);

      // 복사된 파일 찾기 (web 디렉토리의 types.ts 파일)
      const writeFile = Naite.get("fs/promises:writeFile")
        .result()
        .find((f: WriteFileRecord) => f.path.includes("/web/") && f.path.includes(".types.ts"));

      // 파일이 존재하는지 확인 후 스냅샷과 비교
      assert(writeFile);
      await expect(writeFile.data).toMatchFileSnapshot(
        "../testing-data/snapshots/syncer.test.ts.snapshots/copied-types.ts.snap",
      );
    });
  });
  // ============================================
  // 19. TemplateManager 통합 테스트
  // Syncer의 generateTemplate과 TemplateManager가 연동되는지 확인
  // ============================================
  describe("TemplateManager 통합", () => {
    describe("mockTemplateManagerGet을 통한 템플릿 모킹", () => {
      // 목적: mockTemplateManagerGet으로 템플릿을 교체하면 generateTemplate 결과가 변경되는지 확인
      test("mockTemplateManagerGet - generateTemplate 결과 변경", async () => {
        const mockRender = vi.fn().mockReturnValue({
          target: `${Sonamu.config.api.dir}/src/application`,
          path: "mock-entity/mock-entity.entity.json",
          body: JSON.stringify({
            id: "MockEntity",
            title: "Mock 엔티티",
            table: "mock_entities",
            props: [{ name: "id", type: "integer", desc: "ID" }],
            indexes: [],
            subsets: {},
            enums: {},
          }),
          importKeys: [],
        });

        const spy = mockTemplateManagerGet(
          "entity",
          new MockTemplateClass("entity", mockRender, vi.fn()),
        );

        try {
          await syncer.generateTemplate(
            "entity",
            { entityId: "MockEntity", title: "Mock 엔티티" },
            { overwrite: true },
          );

          // mock render가 호출되었는지 확인
          expect(mockRender).toHaveBeenCalledWith(
            expect.objectContaining({
              entityId: "MockEntity",
              title: "Mock 엔티티",
            }),
          );

          // 생성된 파일이 mock 결과인지 확인
          const writeFile = Naite.get("fs/promises:writeFile").first();
          expect(writeFile.path).toContain("mock-entity.entity.json");
        } finally {
          spy.mockRestore();
        }
      });

      // 목적: mockRestore()하면 원본 템플릿으로 복원되는지 확인
      test("mockTemplateManagerGet - mockRestore 후 원본 복원", async () => {
        const originalEntity = TemplateManager.get("entity");

        const mockTemplate = new MockTemplateClass("entity", vi.fn(), vi.fn());
        const spy = mockTemplateManagerGet("entity", mockTemplate);

        // mock 적용 확인
        expect(TemplateManager.get("entity")).toBe(mockTemplate);

        // 복원
        spy.mockRestore();

        // 원본 복원 확인
        expect(TemplateManager.get("entity")).toBe(originalEntity);
      });

      // 목적: 빠른 테스트 실행 (무거운 model 템플릿 → 가벼운 mock)
      test("mockTemplateManagerGet - 빠른 테스트를 위한 경량 mock", async () => {
        const lightweightMock = new MockTemplateClass(
          "model",
          vi.fn().mockReturnValue({
            target: `${Sonamu.config.api.dir}/src/application`,
            path: "sync-fixture/sync-fixture.model.ts",
            body: "// Mocked model for fast testing\nexport class MockModel {}",
            importKeys: [],
          }),
          vi.fn().mockReturnValue({
            target: `${Sonamu.config.api.dir}/src/application`,
            path: "sync-fixture/sync-fixture.model.ts",
          }),
        );

        const renderSpy = vi.spyOn(lightweightMock, "render");
        const spy = mockTemplateManagerGet("model", lightweightMock);

        try {
          await syncer.generateTemplate("model", { entityId: "SyncFixture" }, { overwrite: true });

          expect(renderSpy).toHaveBeenCalled();

          const writeFile = Naite.get("fs/promises:writeFile").first();
          expect(writeFile.data).toContain("// Mocked model for fast testing");
        } finally {
          spy.mockRestore();
        }
      });
    });

    describe("register() - 커스텀 템플릿과 Syncer 연동", () => {
      // 목적: 커스텀 템플릿을 등록하고 사용할 수 있는지 확인
      test("register() - 커스텀 템플릿 등록 후 사용", async () => {
        // 커스텀 감사 엔티티 템플릿
        class AuditEntityTemplate extends Template {
          constructor() {
            super("audit-entity" as TemplateKey);
          }

          render(options: { entityId: string; title: string; table?: string }) {
            const { entityId, title, table } = options;
            const kebabCase = entityId.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();

            return {
              target: `${Sonamu.config.api.dir}/src/application`,
              path: `${kebabCase}/${kebabCase}.entity.json`,
              body: JSON.stringify({
                id: entityId,
                title,
                table: table ?? `${kebabCase.replace(/-/g, "_")}s`,
                props: [
                  { name: "id", type: "integer", unsigned: true, desc: "ID" },
                  {
                    name: "created_at",
                    type: "timestamp",
                    desc: "생성일시",
                    dbDefault: "CURRENT_TIMESTAMP",
                  },
                  { name: "created_by", type: "integer", unsigned: true, desc: "생성자" },
                  { name: "updated_at", type: "timestamp", desc: "수정일시" },
                  { name: "updated_by", type: "integer", unsigned: true, desc: "수정자" },
                  { name: "deleted_at", type: "timestamp", nullable: true, desc: "삭제일시" },
                ],
                indexes: [],
                subsets: { A: ["id", "created_at", "created_by"] },
                enums: {
                  [`${entityId}OrderBy`]: { "id-desc": "ID최신순", "created_at-desc": "최신순" },
                  [`${entityId}SearchField`]: { id: "ID" },
                },
              }),
              importKeys: [],
            };
          }

          getTargetAndPath() {
            return {
              target: `${Sonamu.config.api.dir}/src/application`,
              path: "entity.json",
            };
          }
        }

        TemplateManager.register(new AuditEntityTemplate());

        expect(TemplateManager.exists("audit-entity")).toBe(true);

        // 커스텀 템플릿 사용
        const template = TemplateManager.get("audit-entity");
        const result = await template.render({
          entityId: "AuditTest",
          title: "감사 테스트",
        });

        const entityData = JSON.parse(result.body) as EntityData;

        // 감사 필드 포함 확인
        expect(entityData.props.some((p: EntityProp) => p.name === "created_by")).toBe(true);
        expect(entityData.props.some((p: EntityProp) => p.name === "updated_by")).toBe(true);
        expect(entityData.props.some((p: EntityProp) => p.name === "deleted_at")).toBe(true);
        const orderByEnum = entityData.enums?.AuditTestOrderBy;
        expect(orderByEnum && getEnumDefValues(orderByEnum)["created_at-desc"]).toBe("최신순");
      });

      // 목적: 플러그인 방식으로 여러 템플릿을 일괄 등록
      test("registerAll() - 플러그인 방식 템플릿 일괄 등록", async () => {
        // Admin 플러그인
        function adminPlugin() {
          class AdminDashboardTemplate extends Template {
            constructor() {
              super("admin-dashboard" as TemplateKey);
            }
            render(options: TemplateOptions[TemplateKey] | { entities: string[] }) {
              const opts = options as { entities: string[] };
              return {
                target: ":target/src/admin",
                path: "Dashboard.tsx",
                body: `// Admin Dashboard\n// Entities: ${opts.entities.join(", ")}`,
                importKeys: [],
              };
            }
            getTargetAndPath() {
              return { target: ":target/src/admin", path: "Dashboard.tsx" };
            }
          }

          class AdminCrudTemplate extends Template {
            constructor() {
              super("admin-crud" as TemplateKey);
            }
            render(options: { entityId: string }) {
              return {
                target: ":target/src/admin",
                path: `${options.entityId}Admin.tsx`,
                body: `// ${options.entityId} CRUD Admin`,
                importKeys: [],
              };
            }
            getTargetAndPath() {
              return { target: ":target/src/admin", path: "Admin.tsx" };
            }
          }

          TemplateManager.registerAll([new AdminDashboardTemplate(), new AdminCrudTemplate()]);
        }

        // 플러그인 적용
        adminPlugin();

        expect(TemplateManager.exists("admin-dashboard")).toBe(true);
        expect(TemplateManager.exists("admin-crud")).toBe(true);

        // 플러그인 템플릿 사용
        const dashboardTemplate = TemplateManager.get("admin-dashboard");
        const dashboardResult = await (
          dashboardTemplate.render as unknown as (options: {
            entities: string[];
          }) => Promise<RenderedTemplate>
        )({
          entities: ["SyncFixture", "Company", "Project"],
        });
        expect(dashboardResult.body).toContain("SyncFixture, Company, Project");

        const crudTemplate = TemplateManager.get("admin-crud");
        const crudResult = await crudTemplate.render({
          entityId: "SyncFixture",
        } as TemplateOptions[TemplateKey]);
        expect(crudResult.body).toContain("SyncFixture CRUD Admin");
      });
    });

    describe("handleTruthSourceChanges / handleImplementationChanges와 통합", () => {
      // 목적: handleTruthSourceChanges에서 모킹된 템플릿이 사용되는지 확인
      test("handleTruthSourceChanges - 모킹된 템플릿 적용", async () => {
        const originalGenerated = TemplateManager.get("generated");

        class CustomGeneratedTemplate extends Template {
          constructor() {
            super("generated");
          }

          async render(options: TemplateOptions["generated"]) {
            const result = await originalGenerated.render(options);
            return {
              ...result,
              body: `// Custom Generated Header\n// Generated at: ${new Date().toISOString()}\n\n${result.body}`,
            };
          }

          getTargetAndPath() {
            return originalGenerated.getTargetAndPath();
          }
        }

        const spy = mockTemplateManagerGet("generated", new CustomGeneratedTemplate());

        try {
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
            workflow: [],
            i18n: [],
            sdGenerated: [],
            generatedCopied: [],
            httpGenerated: [],
            servicesGenerated: [],
            typesCopied: [],
            functionsCopied: [],
            i18nCopied: [],
          };

          await syncer.handleTruthSourceChanges(diffGroups);

          // generated 파일에 커스텀 헤더가 추가되었는지 확인
          const writeFiles = Naite.get("fs/promises:writeFile").result();
          const generatedFile = writeFiles.find((f: WriteFile) =>
            f.path.includes("sonamu.generated.ts"),
          );

          if (generatedFile) {
            expect(generatedFile.data).toContain("// Custom Generated Header");
          }
        } finally {
          spy.mockRestore();
        }
      });

      // 목적: handleImplementationChanges에서 모킹된 service 템플릿 적용 확인
      test("handleImplementationChanges - 모킹된 services 템플릿", async () => {
        const originalService = TemplateManager.get("services");

        class CustomServicesTemplate extends Template {
          constructor() {
            super("services");
          }

          async render(options: TemplateOptions["services"]) {
            const result = await originalService.render(options);
            return {
              ...result,
              body: `// Custom Service Header\n${result.body}`,
            };
          }

          getTargetAndPath(names?: EntityNamesRecord) {
            return originalService.getTargetAndPath(names);
          }
        }

        const spy = mockTemplateManagerGet("services", new CustomServicesTemplate());

        try {
          await syncer.handleImplementationChanges({
            model: [
              join(
                apiRootPath,
                "src/application/sync-fixture/sync-fixture.model.ts",
              ) as AbsolutePath,
            ],
            frame: [],
            types: [],
            functions: [],
            generated: [],
            entity: [],
            config: [],
            workflow: [],
            i18n: [],
            sdGenerated: [],
            generatedCopied: [],
            httpGenerated: [],
            servicesGenerated: [],
            typesCopied: [],
            functionsCopied: [],
            i18nCopied: [],
          });

          const writeFiles = Naite.get("fs/promises:writeFile").result();
          const serviceFile = writeFiles.find((f: WriteFile) => f.path.includes(".service.ts"));

          if (serviceFile) {
            expect(serviceFile.data).toContain("// Custom Service Header");
          }
        } finally {
          spy.mockRestore();
        }
      });
    });
  });

  describe("SON-455 generation regression", () => {
    test("sub model 변경 후 services.generated.ts에 main/sub model service가 모두 존재한다", async () => {
      const originalRegisteredApis = [...registeredApis];
      const webRootPath = join(apiRootPath, "../web");
      const invalidatedPath = join(
        apiRootPath,
        "src/application/sync-fixture/sync-fixture-sub.model.ts",
      ) as AbsolutePath;

      try {
        await syncer.autoloadModels();
        await syncer.autoloadTypes();
        await syncer.autoloadApis();

        expect(syncer.apis.map((api) => api.modelName)).toEqual(
          expect.arrayContaining(["SyncFixtureModel", "SyncFixtureSubModel"]),
        );

        syncer.removeInvalidatedRegisteredApis(invalidatedPath);
        await import(`${pathToFileURL(invalidatedPath).href}?son455=${Date.now()}`);
        expect(registeredApis.map((api) => api.modelName)).toContain("SyncFixtureSubModel");

        await syncer.handleImplementationChanges({
          model: [invalidatedPath],
          frame: [],
          types: [],
          functions: [],
          generated: [],
          entity: [],
          config: [],
          workflow: [],
          i18n: [],
          sdGenerated: [],
          generatedCopied: [],
          httpGenerated: [],
          servicesGenerated: [],
          typesCopied: [],
          functionsCopied: [],
          i18nCopied: [],
        });

        const serviceFile = Naite.get("fs/promises:writeFile")
          .result()
          .find(
            (file: WriteFileRecord) =>
              file.path === join(webRootPath, "src/services/services.generated.ts"),
          );

        assert(serviceFile);
        expect(typeof serviceFile.data).toBe("string");
        assert(typeof serviceFile.data === "string");
        expect(serviceFile.data).toContain("export namespace SyncFixtureService");
        expect(serviceFile.data).toContain("export namespace SyncFixtureSubService");
      } finally {
        registeredApis.length = 0;
        registeredApis.push(...originalRegisteredApis);
      }
    });
  });
});
