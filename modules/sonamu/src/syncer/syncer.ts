import { hot } from "@sonamu-kit/hmr-hook";
import assert from "assert";
import chalk from "chalk";
import { EventEmitter } from "events";
import { mkdir, readFile, writeFile } from "fs/promises";
import inflection from "inflection";
import { minimatch } from "minimatch";
import path from "path";
import { group, unique } from "radashi";
import type { z } from "zod";
import type { WorkflowMetadata } from "..";
import { registeredApis } from "../api/decorators";
import { Sonamu } from "../api/sonamu";
import { EntityManager, type EntityNamesRecord } from "../entity/entity-manager";
import { AlreadyProcessedException } from "../exceptions/so-exceptions";
import { Naite } from "../naite/naite";
import { TemplateManager } from "../template/template-manager";
import type { GenerateOptions, PathAndCode } from "../types/types";
import { TemplateKey, type TemplateOptions } from "../types/types";
import { mapAsync, reduceAsync } from "../utils/async-utils";
import { centerText } from "../utils/console-util";
import { isTest } from "../utils/controller";
import { copyFileWithReplaceCoreToShared, exists } from "../utils/fs-utils";
import type { AbsolutePath } from "../utils/path-utils";
import { runWithGracefulShutdown } from "../utils/process-utils";
import { findChangedFilesUsingChecksums, renewChecksums } from "./checksum";
import { generateTemplate, renderTemplate } from "./code-generator";
import { createEntity, delEntity } from "./entity-operations";
import {
  checksumPatternGroup,
  type FileType,
  getChecksumPatternGroupInAbsolutePath,
} from "./file-patterns";
import {
  type LoadedApis,
  type LoadedModels,
  type LoadedTypes,
  loadApis,
  loadModels,
  loadTypes,
  loadWorkflows,
} from "./module-loader";
import * as SyncerActions from "./syncer-actions";

type DiffGroups = {
  [key in FileType]: AbsolutePath[];
};

export class Syncer {
  apis: LoadedApis = [];
  types: LoadedTypes = {};
  models: LoadedModels = {};
  workflows: Map<string, WorkflowMetadata[]> = new Map();
  eventEmitter: EventEmitter = new EventEmitter();

  /**
   * 체크섬이 변경된 부분에 대해 싱크를 진행합니다.
   * sonamu.shared.ts는 파일이 없을 때만 1회 생성하고, 이후에는 덮어쓰지 않습니다.
   * @returns
   */
  async sync(): Promise<void> {
    const { targets } = Sonamu.config.sync;

    // sonamu.shared.ts는 파일이 없을 때만 1회 생성합니다.
    await this.copySharedToTargets(targets);

    // 그 다음부터는 변경된 파일을 찾아서 동기화 작업을 실행합니다.
    const changedFiles = await findChangedFilesUsingChecksums();
    if (changedFiles.length === 0) {
      console.log(chalk.black.bgGreen(centerText("All files are synced!")));

      // 변경사항이 없어도 SSR 템플릿은 생성 (초기 설정 시, 이미 존재하면 스킵)
      try {
        await generateTemplate("queries", {}, { overwrite: false });
        await generateTemplate("entry_server", {}, { overwrite: false });
      } catch (e) {
        // 파일이 이미 존재하면 무시
        if (!(e instanceof AlreadyProcessedException)) {
          console.error("Failed to generate SSR templates:", e);
        }
      }

      return;
    }

    // 만약 싱크 중에 프로세스가 죽으면 꼬여버리기 때문에,
    // 시그널에도 잠시 버틸 수 있는 환경 속에서 싱크를 실행합니다.
    await runWithGracefulShutdown(
      async () => {
        // 얘가 싱크 작업 수행하는 본체입니다.
        await this.doSyncActions(changedFiles);

        // 싱크 액션이 끝나면 항상 체크섬을 다시 갱신합니다.
        await renewChecksums();
      },
      { whenThisHappens: "SIGUSR2", waitForUpTo: 20000 },
    );
  }

  /**
   * Watcher가 감지한 파일 변경 사항에 대해 싱크를 진행합니다.
   * 주어진 변경 파일들 중 체크섬 관리 대상인 것들만 가져다가 싱크를 진행합니다.
   * 체크섬 파일 업데이트는 여기에서 하지 않습니다. 호출자가 합니다.
   * @param diffFilePath - 변경 파일들. 프로젝트 루트부터 "src/" 또는 "dist/"로 시작하는 상대 경로입니다. 예시: "src/application/user/user.model.ts"
   */
  async syncFromWatcher(event: string, diffFilePath: AbsolutePath): Promise<void> {
    if (event !== "change" && event !== "add" && event !== "unlink") {
      return;
    }

    // SSR 설정 파일 변경 감지
    if (diffFilePath.includes("/src/ssr/")) {
      console.log(chalk.bold.yellow("SSR config changed - reloading..."));
      // SSR 파일도 invalidate 후 reload
      if (!isTest()) {
        await hot.invalidateFile(diffFilePath, event);
      }
      await this.autoloadSSRRoutes();
      this.eventEmitter.emit("onHMRCompleted");
      return;
    }

    // 일단 변경된 파일과 dependent 파일들을 invalidate 합니다.
    // 한 번 이상 import된 친구들에 대해서만 실제 작업이 일어납니다.
    // 그러니 안심하고 invalidate 해도 됩니다.
    // 테스트 환경에서는 hot.invalidateFile시 초기 에러가 발생하기 때문에 invalidate 하지 않습니다.
    if (!isTest()) {
      const invalidatedPaths = (await hot.invalidateFile(diffFilePath, event)) as AbsolutePath[];

      if (invalidatedPaths.length > 0) {
        console.log(chalk.bold(`🔄 Invalidated:`));

        for (const invalidatedPath of invalidatedPaths) {
          try {
            // 만약 model.ts 파일이 변경(invalidate)되었다? 그러면 registeredApis 중에서 이 모델에 해당하는 api들은 지워줘요.
            // registeredApis는 통으로 다 날려버릴 수 없습니다. registeredApis에 올라오는 친구들은 초기 로드시 또는 HMR시에만 등록되기 때문입니다.
            // 따라서 model.ts 파일의 변경으로 다음번 새로운 eval이 예상되는 이 시점에서만, 이 모델에서 나온 registeredApis들을 지워줄 수 있습니다.
            const removedApis = this.removeInvalidatedRegisteredApis(invalidatedPath);
            if (removedApis.length > 0) {
              console.log(
                chalk.blue(`- ${path.relative(Sonamu.apiRootPath, invalidatedPath)}`),
                chalk.gray(`(with ${removedApis.length} APIs)`),
              );
            } else {
              console.log(chalk.blue(`- ${path.relative(Sonamu.apiRootPath, invalidatedPath)}`));
            }
          } catch (e) {
            console.error(e);
            console.error(
              chalk.red(`Failed to remove invalidated registered APIs for ${invalidatedPath}`),
            );
          }
        }
      }
    }

    // devRunner 활성화 시, 변경된 소스 파일을 Vitest 모듈 그래프에서도 무효화합니다.
    // Vite의 moduleGraph.invalidateModule()이 importer 방향으로 재귀적 cascade하므로,
    // 소스 파일 하나만 무효화하면 이를 import하는 테스트 파일도 자동으로 무효화됩니다.
    if (!isTest() && Sonamu.config.test?.devRunner?.enabled && Sonamu.devVitestManager) {
      Sonamu.devVitestManager.invalidateFiles([diffFilePath]);
      console.log(
        chalk.dim(`Test invalidated: ${path.relative(Sonamu.apiRootPath, diffFilePath)}`),
      );
    }

    const isInCheckPatternGroup = Object.values(getChecksumPatternGroupInAbsolutePath()).some(
      (pattern) => minimatch(diffFilePath, pattern),
    );

    // 할 일(sync)이 있으면 합니다.
    if (isInCheckPatternGroup) {
      await this.doSyncActions([diffFilePath]);
    }

    // 싱크 작업이 끝나면 모든 모듈을 로드합니다.
    // hmr-hook에 의해 invalidate된 부분들이 아니라면 캐시 그대로 유지합니다.
    await this.autoloadTypes();
    await this.autoloadModels();
    await this.autoloadApis();
    await this.autoloadWorkflows();

    this.eventEmitter.emit("onHMRCompleted");
  }

  removeInvalidatedRegisteredApis(
    invalidatedPath: AbsolutePath,
  ): (typeof registeredApis)[number][] {
    if (!invalidatedPath.endsWith(".model.ts" /*소스 코드를 다루는 상황이니 .ts 경로로 봅니다.*/)) {
      return [];
    }

    const entityId = EntityManager.getEntityIdFromPath(invalidatedPath);
    const toRemove = registeredApis.filter((api) => api.modelName === `${entityId}Model`);
    for (const api of toRemove) {
      const idx = registeredApis.indexOf(api);
      if (idx !== -1) {
        registeredApis.splice(idx, 1);
      }
    }

    return toRemove;
  }

  async copySharedToTargets(targets: string[]): Promise<void> {
    // plural.ts 내용을 읽어서 shared 파일에 삽입합니다.
    const dictUtilsPath = path.join(
      import.meta.dirname.replace("/dist/", "/src/"),
      "../dict/utils.ts",
    );
    const dictUtilsCode = (await exists(dictUtilsPath))
      ? await readFile(dictUtilsPath, "utf-8")
      : "";

    // 특정 변수 치환을 위해서 사용합니다.
    const convertMap = {
      baseUrl:
        Sonamu.config.server.baseUrl ??
        `http://${Sonamu.config.server.listen?.host ?? "localhost"}:${Sonamu.config.server.listen?.port ?? 3000}`,
      dictUtils: dictUtilsCode,
    };

    for (const target of targets) {
      // 지금 가져가려는 이 파일은 Sonamu 코드베이스의 일부입니다.
      // 그런데 dist 속 빌드된 소스 코드 파일이 필요한 것이 아니고, src에만 있는 텍스트 파일이 필요합니다.
      // 따라서 /src/에서 찾습니다.
      const srcPath = path.join(
        import.meta.dirname.replace("/dist/", "/src/"),
        `../shared/${target}.shared.ts.txt`,
      );
      if (!(await exists(srcPath))) {
        continue;
      }
      if (!(await exists(path.join(Sonamu.appRootPath, target)))) {
        throw new Error(
          `Tried to copy sonamu.shared.ts to target '${target}' but the target directory does not exist. Please check your project directory structure.`,
        );
      }

      const fullText = await readFile(srcPath, "utf-8");
      const convertedText = Object.entries(convertMap).reduce(
        (acc, [key, value]) => acc.replace(`$[[${key}]]`, value),
        fullText,
      );

      // 이건 프로젝트에 .ts 소스 코드 파일을 생성하는 것이므로 src의 .ts 경로로 갑니다.
      const destPath = path.join(Sonamu.appRootPath, target, "src/services/sonamu.shared.ts");

      // 정말 혹시나지만 target 디렉토리는 있어도 src/services 디렉토리는 없을 수 있으므로 미리 생성해줍니다.
      if (!(await exists(path.dirname(destPath)))) {
        await mkdir(path.dirname(destPath), { recursive: true });
        console.warn(`Created directory '${path.dirname(destPath)}' because it did not exist.`);
      }

      // 파일이 이미 존재하면 건너뜁니다.
      // sonamu.shared.ts는 프로젝트에서 자유롭게 커스터마이징할 수 있어야 하므로,
      // 최초 1회만 생성하고 이후에는 덮어쓰지 않습니다.
      // 템플릿 내용($[[dictUtils]] 등)이 변경되었을 때 반영이 필요하면,
      // 해당 파일을 삭제한 뒤 `pnpm sonamu sync`로 재생성하면 됩니다.
      if (await exists(destPath)) {
        continue;
      }

      await writeFile(destPath, convertedText);
      !isTest() &&
        console.log(
          chalk.bold("Copied: ") + chalk.blue(path.relative(Sonamu.appRootPath, destPath)),
        );
    }
  }

  async autoloadTypes() {
    this.types = await loadTypes();
  }

  async autoloadModels() {
    this.models = await loadModels();
  }

  async autoloadApis() {
    this.apis = await loadApis();
  }

  async autoloadWorkflows() {
    this.workflows = await loadWorkflows();
    await Sonamu.workflows?.synchronize(this.workflows);
  }

  async autoloadSSRRoutes(): Promise<void> {
    const ssrConfigPath = path.join(Sonamu.apiRootPath, "src/ssr");

    // 기존 routes 초기화
    const { clearSSRRoutes } = await import("../ssr");
    clearSSRRoutes();

    // ssr 폴더 없으면 스킵
    if (!(await exists(ssrConfigPath))) {
      return;
    }

    // ssr 폴더 안의 모든 .ts 파일 로드
    const { globAsync } = await import("../utils/async-utils");
    const { importMembers } = await import("../utils/esm-utils");
    const { runtimePath } = await import("../utils/path-utils");

    // runtimePath를 사용하여 개발/프로덕션 환경에 맞는 확장자 처리
    const files = await globAsync(path.join(ssrConfigPath, runtimePath("**/*.ts")));

    for (const file of files) {
      try {
        // importMembers를 사용하면 파일의 side effect(registerSSR 호출)가 실행됨
        await importMembers(file);
      } catch (e) {
        console.error(`Failed to load SSR route: ${file}`, e);
      }
    }
  }

  /**
   * 실제 싱크를 수행하는 본체입니다.
   * 변경된 파일들을 타입별로 분류하고 각 타입에 맞는 액션을 실행합니다.
   * @param diffFilePaths - 변경된 파일들의 절대 경로 목록
   * @returns diffTypes - 변경된 파일의 타입 목록 (entity, types, model 등)
   */
  async doSyncActions(diffFilePaths: AbsolutePath[]): Promise<{ diffTypes: string[] }> {
    const diffGroups = this.calculateDiffGroups(diffFilePaths);
    const diffTypes = Object.keys(diffGroups) as FileType[];

    // Single source of truth가 변경된 경우
    if (diffTypes.includes("entity") || diffTypes.includes("types")) {
      await this.handleTruthSourceChanges(diffGroups, diffTypes);
    }

    // 타겟으로 복사만 하면 되는 파일이 변경된 경우
    if (
      diffTypes.includes("types") ||
      diffTypes.includes("functions") ||
      diffTypes.includes("generated")
    ) {
      await this.handleSyncableFileChanges(diffGroups);
    }

    // 모델/프레임 구현체가 변경된 경우
    if (diffTypes.includes("model") || diffTypes.includes("frame")) {
      await this.handleImplementationChanges(diffGroups);
    }

    // 설정 파일이 변경된 경우
    if (diffTypes.includes("config")) {
      await SyncerActions.actionSyncConfig();
    }

    // 워크플로우 파일이 변경된 경우
    if (diffTypes.includes("workflow")) {
      await this.autoloadWorkflows();
    }

    // i18n 관련 파일이 변경된 경우
    // - i18n/*.ts: locale 번역 파일
    // - entity.json: entity labels
    // - sonamu.config.ts: i18n 설정 (defaultLocale, supportedLocales)
    if (
      diffTypes.includes("i18n") ||
      diffTypes.includes("entity") ||
      diffTypes.includes("config")
    ) {
      await this.syncSD();
    }

    return {
      diffTypes,
    };
  }

  calculateDiffGroups(diffFiles: AbsolutePath[]): DiffGroups {
    const fileTypes = Object.keys(checksumPatternGroup) as FileType[];

    return group(diffFiles, (filePath) => {
      // 절대 경로에서 src/로 시작하는 상대 경로 부분을 추출합니다.
      const srcIndex = filePath.indexOf("/src/");
      if (srcIndex === -1) return "unknown";
      const relativePath = filePath.slice(srcIndex + 1); // "src/..." 형태

      for (const fileType of fileTypes) {
        if (minimatch(relativePath, checksumPatternGroup[fileType])) {
          return fileType;
        }
      }
      return "unknown";
    }) as unknown as DiffGroups;
  }

  async handleTruthSourceChanges(diffGroups: DiffGroups, diffTypes: string[]): Promise<void> {
    Naite.t("handleTruthSourceChanges", { diffGroups, diffTypes });

    await EntityManager.reload();

    // types 생성(entity 새로 추가된 경우)
    // parentId가 없고, types가 없는 경우에만 생성
    const entityPath = diffGroups.entity?.at(0);
    if (entityPath !== undefined) {
      const entityId = EntityManager.getEntityIdFromPath(entityPath);
      const entity = EntityManager.get(entityId);
      // 프로젝트에 생성되어야 하는 .ts 파일의 경로입니다.
      const typeFilePath = path.join(
        Sonamu.apiRootPath,
        `src/application/${entity.names.fs}/${entity.names.fs}.types.ts`,
      );
      if (entity.parentId === undefined && !(await exists(typeFilePath))) {
        await generateTemplate("init_types", { entityId });
      }
    }

    await SyncerActions.actionGenerateSchemas();

    diffGroups.generated = unique([
      ...(diffGroups.generated ?? []),
      path.join(Sonamu.apiRootPath, "src/application/sonamu.generated.ts") as AbsolutePath,
    ]);
    diffTypes.push("generated");
  }

  async handleSyncableFileChanges(diffGroups: DiffGroups): Promise<FileType[]> {
    const tsPaths = unique([
      ...(diffGroups.types ?? []),
      ...(diffGroups.functions ?? []),
      ...(diffGroups.generated ?? []),
    ]);
    Naite.t("handleSyncableFileChanges", { diffGroups });

    // console.log(
    //   chalk.gray(
    //     `[Processing] Handling types/functions/generated changes: ${tsPaths.map((p) => path.relative(Sonamu.apiRootPath, p)).join(", ")}`
    //   )
    // );

    await SyncerActions.actionSyncFilesToTargets(tsPaths);

    return [];
  }

  async handleImplementationChanges(diffGroups: DiffGroups): Promise<void> {
    Naite.t("handleImplementationChanges", { diffGroups });
    const mergedGroup = [...(diffGroups.model ?? []), ...(diffGroups.frame ?? [])];

    // console.log(
    //   chalk.gray(
    //     `[Processing] Handling model/frame changes: ${mergedGroup.map((p) => path.relative(Sonamu.apiRootPath, p)).join(", ")}`
    //   )
    // );

    // generated_http.template.ts에서 syncer.types를 씁니다.
    // service.template.ts에서 syncer.apis를 씁니다.
    await this.autoloadModels();
    await this.autoloadTypes();
    await this.autoloadApis();

    const params: {
      namesRecord: EntityNamesRecord;
    }[] = mergedGroup.map((modelPath) => {
      if (modelPath.endsWith(".model.ts")) {
        const entityId = EntityManager.getEntityIdFromPath(modelPath);
        assert(entityId);
        return {
          namesRecord: EntityManager.getNamesFromId(entityId),
        };
      }
      if (modelPath.endsWith(".frame.ts")) {
        const [, frameName] = modelPath.match(/.+\/(.+)\.frame\.ts$/) ?? [];
        assert(frameName);
        // frameName을 PascalCase로 변환 (dashboard -> Dashboard)
        const frameId = inflection.camelize(frameName);
        return {
          namesRecord: EntityManager.getNamesFromId(frameId),
        };
      }
      throw new Error("not reachable");
    });

    await SyncerActions.actionGenerateServices(params);
    await SyncerActions.actionGenerateHttps();
    await SyncerActions.actionGenerateSsr();
  }

  /**
   * 주어진 엔티티와 템플릿 키에 대해, 생성된 코드가 존재하는지 확인합니다.
   * @param entityId 엔티티 ID
   * @param templateKey 템플릿 키
   * @param enumId 열거형 ID
   * @returns 생성된 코드가 존재하는지 여부
   */
  async checkExistsGenCode(
    entityId: string,
    templateKey: TemplateKey,
    enumId?: string,
  ): Promise<{ subPath: string; fullPath: string; isExists: boolean }> {
    const { target, path: genPath } = TemplateManager.get(templateKey).getTargetAndPath(
      EntityManager.getNamesFromId(entityId),
      enumId,
    );

    const subPath = path.join(target, genPath);
    const fullPath = path.join(Sonamu.appRootPath, subPath);
    return {
      subPath,
      fullPath,
      isExists: await exists(fullPath),
    };
  }

  /**
   * 주어진 엔티티와 열거형에 대해, 생성된 코드가 존재하는지 확인합니다.
   * @param entityId 엔티티 ID
   * @param enums 열거형 레이블
   * @returns 생성된 코드가 존재하는지 여부
   */
  async checkExists(
    entityId: string,
    enums: {
      [name: string]: z.ZodEnum<Readonly<Record<string, string | number>>>;
    },
  ): Promise<Record<`${TemplateKey}${string}`, boolean>> {
    const keys: TemplateKey[] = TemplateKey.options;
    const names = EntityManager.getNamesFromId(entityId);
    const enumsKeys = Object.keys(enums).filter((name) => name !== names.constant);

    return await reduceAsync(
      keys,
      async (result, key) => {
        const tpl = TemplateManager.get(key);
        if (key.startsWith("view_enums")) {
          await mapAsync(enumsKeys, async (componentId) => {
            const { target, path: p } = tpl.getTargetAndPath(names, componentId);
            result[`${key}__${componentId}`] = await exists(
              path.join(Sonamu.appRootPath, target, p),
            );
          });
          return result;
        }

        const { target, path: p } = tpl.getTargetAndPath(names);
        const { targets } = Sonamu.config.sync;
        if (target.includes(":target")) {
          await mapAsync(targets, async (t) => {
            result[`${key}__${t}`] = await exists(
              path.join(Sonamu.appRootPath, target.replace(":target", t), p),
            );
          });
        } else {
          result[key] = await exists(path.join(Sonamu.appRootPath, target, p));
        }

        return result;
      },
      {} as Record<`${TemplateKey}${string}`, boolean>,
    );
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async createEntity(form: TemplateOptions["entity"]) {
    return await createEntity(form);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async delEntity(entityId: string): Promise<{ delPaths: string[] }> {
    return await delEntity(entityId);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async generateTemplate<T extends TemplateKey>(
    key: T,
    templateOptions: TemplateOptions[T],
    _generateOptions?: GenerateOptions,
  ): Promise<AbsolutePath[]> {
    return await generateTemplate(key, templateOptions, _generateOptions);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async renderTemplate<T extends keyof TemplateOptions>(
    key: T,
    templateOptions: TemplateOptions[T],
  ): Promise<PathAndCode[]> {
    return await renderTemplate(key, templateOptions);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async renewChecksums(): Promise<void> {
    return await renewChecksums();
  }

  /**
   * SD(Sonamu Dictionary) 템플릿을 생성합니다.
   */
  async syncSD(): Promise<void> {
    const { targets } = Sonamu.config.sync;
    const i18nConfig = Sonamu.config.i18n;

    const targetList = ["api", ...targets] as ("api" | "web" | "app")[];

    const apiI18nDir = path.join(Sonamu.appRootPath, Sonamu.config.api.dir, "src/i18n");

    for (const target of targetList) {
      try {
        // web/app의 경우 locale 파일들을 api에서 복사
        if (target !== "api") {
          await this.syncLocaleFiles(target, apiI18nDir, i18nConfig.supportedLocales);
        }

        await generateTemplate("sd", { target }, { overwrite: true });
      } catch (e) {
        console.error(`Failed to generate SD template for ${target}:`, e);
      }
    }
  }

  /**
   * api의 locale 파일을 web/app으로 복사합니다.
   */
  private async syncLocaleFiles(
    target: string,
    apiI18nDir: string,
    locales: string[],
  ): Promise<void> {
    const targetI18nDir = path.join(Sonamu.appRootPath, target, "src/i18n");

    // 디렉토리가 없으면 생성
    await mkdir(targetI18nDir, { recursive: true });

    for (const locale of locales) {
      const sourceFile = path.join(apiI18nDir, `${locale}.ts`);
      const targetFile = path.join(targetI18nDir, `${locale}.ts`);

      const syncHeader = [
        "/**",
        " * @generated",
        " * API에서 동기화된 파일입니다. 직접 수정하지 마세요.",
        " */",
      ].join("\n");
      await copyFileWithReplaceCoreToShared(sourceFile, targetFile, syncHeader);
      !isTest() &&
        console.log(chalk.bold("Copied: ") + chalk.cyan(`${target}/src/i18n/${locale}.ts`));
    }
  }
}
