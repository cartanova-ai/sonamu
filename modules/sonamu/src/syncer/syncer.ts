import assert from "assert";
import { EventEmitter } from "events";
import { unlink } from "fs/promises";
import path from "path";

import { hot } from "@sonamu-kit/hmr-hook";
import chalk from "chalk";
import { minimatch } from "minimatch";
import { group, unique } from "radashi";
import { type z } from "zod";

import { registeredApis } from "../api/decorators";
import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import { type EntityNamesRecord } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import { type WorkflowMetadata } from "../tasks/decorator";
import { TemplateManager } from "../template/template-manager";
import { type GenerateOptions, type PathAndCode } from "../types/types";
import { TemplateKey } from "../types/types";
import { type TemplateOptions } from "../types/types";
import { mapAsync, reduceAsync } from "../utils/async-utils";
import { centerText } from "../utils/console-util";
import { isTest } from "../utils/controller";
import { exists } from "../utils/fs-utils";
import { type AbsolutePath } from "../utils/path-utils";
import { runWithGracefulShutdown } from "../utils/process-utils";
import { findChangedFilesUsingChecksums, renewChecksums } from "./checksum";
import { generateTemplate, renderTemplate } from "./code-generator";
import { createEntity, delEntity } from "./entity-operations";
import { getChecksumPatternGroup, getChecksumPatternGroupInAbsolutePath } from "./file-patterns";
import { type FileType } from "./file-patterns";
import { loadApis, loadModels, loadTypes, loadWorkflows } from "./module-loader";
import { type LoadedApis, type LoadedModels, type LoadedTypes } from "./module-loader";
import * as SyncerActions from "./syncer-actions";

type DiffGroups = Partial<{
  [key in FileType]: AbsolutePath[];
}>;

export class Syncer {
  apis: LoadedApis = [];
  types: LoadedTypes = {};
  models: LoadedModels = {};
  workflows: Map<string, WorkflowMetadata[]> = new Map();
  eventEmitter: EventEmitter = new EventEmitter();

  /**
   * 체크섬이 변경된 부분에 대해 싱크를 진행합니다.
   * dev 서버가 처음 떴을 때, sonamu sync 할 때 실행됩니다. 이후에는 hmrAndSync 경로를 타요.
   * @returns
   */
  async sync(): Promise<void> {
    // 초기 부트스트랩! 얘네들은 idempotent하고 가볍기 때문에 무지성 실행해도 됩니다.
    // 얘네들은 sonamu.lock에 들어가지도 않고 따라서 HMR 경로를 타지도 않는 친구들입니다.
    // 그래서 아무 때나 그냥 돌려주면 되는데, hmrAndSync에서 매번 하는 것은 낭비이니 여기서 한 번만 합니다.
    await SyncerActions.actionCopySharedToTargetsIfNotExists();
    await SyncerActions.actionGenerateSsrEntryServerIfNotExists();

    // 바뀐 것이 없으면 그냥 넘어가요.
    const changedFiles = await findChangedFilesUsingChecksums();
    if (changedFiles.length === 0) {
      if (await this.reconcileHttpValidatorRegistry()) {
        await renewChecksums();
      }
      console.log(chalk.black.bgGreen(centerText("All files are synced!")));
      return;
    }

    // 여기서 실제 싱크 동작을 수행합니다.
    // 다만 싱크 중에 프로세스가 죽으면 꼬여버리기 때문에,
    // 시그널에도 잠시 버틸 수 있는 환경 속에서 싱크를 실행합니다.
    await runWithGracefulShutdown(
      async () => {
        // 얘가 싱크 작업 수행하는 본체입니다.
        await this.doSyncActions(changedFiles);
        await this.reconcileHttpValidatorRegistry();

        // 싱크 액션이 끝나면 항상 체크섬을 다시 갱신합니다.
        await renewChecksums();
      },
      { whenThisHappens: "SIGUSR2", waitForUpTo: 20000 },
    );
  }

  private async reconcileHttpValidatorRegistry(): Promise<boolean> {
    const registryPath = path.join(
      Sonamu.apiRootPath,
      "src/application/sonamu.validators.generated.ts",
    );
    const policy = Sonamu.config.validation?.zodCompiler;
    const isAot = typeof policy === "object" && policy !== null && policy.api === "aot";
    if (isAot === (await exists(registryPath))) {
      return false;
    }

    // 변경 목록이 registry 삭제를 놓쳐도 checksum 갱신 전에 정책과 산출물을 다시 맞춥니다.
    await SyncerActions.actionGenerateHttpValidators();
    return true;
  }

  /**
   * 강제 풀-싱크: lock을 무시하고 처음부터 다시 싱크합니다.
   *
   * **사용처**: git post-merge hook, CI, dev 서버의 `f` 핫키.
   * **실패 안전성**: 도중에 프로세스가 죽어 lock 없는 상태로 남아도 무해 — 다음 sync에서
   * lock 없으면 자연스럽게 풀-싱크가 트리거되어 새 lock이 작성됨.
   */
  async forceSync(): Promise<void> {
    const lockPath = path.join(Sonamu.apiRootPath, "sonamu.lock");
    if (await exists(lockPath)) {
      await unlink(lockPath);
    }
    await this.sync();
  }

  /**
   * Watcher가 batch로 모은 변경 파일들에 대해 한 번의 HMR/sync 사이클을 돕니다.
   *
   * HMR은 api/src 안에서 일어나는 모든 파일들에 대해서 수행합니다.
   * checksumPatternGroup 매칭 여부와 무관하게 api/src 전체 대상입니다.
   * 가령 api/src/utils/subset-loaders.ts 같은 파일도 변경되면 HMR은 해줍니다.
   *
   * Sync는 checksumPatternGroup으로 매칭되는 파일들에 대해서만 수행합니다.
   * 여기에는 web/src나 app/src 같은 다른 target의 파일이 포함될 수 있습니다.
   * 이런 non-api 경로의 파일들은 HMR과는 아무 상관이 없으므로, invalidate을 하지 않습니다.
   *
   * @param fileEvents - path → event 맵. event는 "change" | "add".
   */
  async hmrAndSync(fileEvents: Map<AbsolutePath, "change" | "add">): Promise<void> {
    const hmrActionRequiredEvents = this.extractHmrActionRequiredFileEvents(fileEvents);
    const syncTriggeringPaths = await this.extractSyncTriggeringFileEventPaths(fileEvents);

    // HMR 영역: 파일 이벤트 중 api의 모듈 그래프에 있는 파일들에 대한 변동은 hmrActionRequiredEvents로 잡힙니다.
    // 이 친구들은 invalidate 처리해줍니다.
    // 이 호출은 아래 sync보다 무조건 먼저 일어나야 합니다!
    // 왜냐하면 sync에서는 변경된 model 코드를 새로 import해서 처리해야 하는 경우도 있기 때문입니다.
    await this.invalidateDependentsAffectedByFileEvents(hmrActionRequiredEvents);

    // Sync 영역: checksumPatternGroup에 명시된 파일들에 대한 변동은 syncTriggeringPaths로 잡힙니다.
    // 이 친구들은 적절한 sync 작업으로 대응합니다.
    if (syncTriggeringPaths.length > 0) {
      await this.doSyncActions(syncTriggeringPaths);
    }

    // 싱크 작업이 끝났으면 무지성 로드를 수행합니다.
    // 싱크를 안 한 경우에도 로드는 해야 해요. 위에서 관련있는 친구들은 다 invalidate 되었거든요!
    //
    // 변경된 파일들에 대해서 새롭게 당겨오는(load) 행위는 doSyncActions에서 하지 않습니다.
    // doSyncActions에서는 파일을 읽고 만드는 싱크 행위만 합니다.
    // 거기서 딱 변경된 부분에 영향받는 autoload만 선별해서 수행하려면 너무 지저분하고 복잡해집니다.
    //
    // 퍼포먼스 영향은 무시해도 좋습니다.
    // 어차피 hmr-hook에 의해 invalidate된 부분들이 아니라면 캐시 그대로 유지합니다.
    await this.autoloadTypes();
    await this.autoloadModels();
    await this.autoloadApis();
    await this.autoloadWorkflows();
    await this.autoloadSsrRoutes();
    await Sonamu.refreshHttpValidators();

    this.eventEmitter.emit("onHMRCompleted");
  }

  private extractHmrActionRequiredFileEvents(
    fileEvents: Map<AbsolutePath, "change" | "add">,
  ): Map<AbsolutePath, "change" | "add"> {
    const apiSrc = path.join(Sonamu.apiRootPath, "src");
    const result = new Map<AbsolutePath, "change" | "add">();
    for (const [filePath, event] of fileEvents) {
      if (!filePath.startsWith(apiSrc)) {
        continue;
      }
      result.set(filePath, event);
    }
    return result;
  }

  private async extractSyncTriggeringFileEventPaths(
    fileEvents: Map<AbsolutePath, "change" | "add">,
  ): Promise<AbsolutePath[]> {
    const checkPatternGroup = getChecksumPatternGroupInAbsolutePath();
    const syncTriggeringPaths: AbsolutePath[] = [];
    for (const [diffFilePath] of fileEvents) {
      const isInCheckPatternGroup = Object.values(checkPatternGroup).some((pattern) =>
        minimatch(diffFilePath, pattern),
      );
      if (!isInCheckPatternGroup) {
        continue;
      }
      syncTriggeringPaths.push(diffFilePath);
    }

    return syncTriggeringPaths;
  }

  private async invalidateDependentsAffectedByFileEvents(
    fileEvents: Map<AbsolutePath, "change" | "add">,
  ) {
    for (const [diffFilePath, event] of fileEvents) {
      // 변경된 파일과 dependent 파일들을 invalidate 합니다.
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
    }
  }

  removeInvalidatedRegisteredApis(
    invalidatedPath: AbsolutePath,
  ): (typeof registeredApis)[number][] {
    // 소스 코드를 다루는 상황이니 .ts 경로로 봅니다.
    const isModel = invalidatedPath.endsWith(".model.ts");
    const isFrame = invalidatedPath.endsWith(".frame.ts");
    if (!isModel && !isFrame) {
      return [];
    }

    const entityId = EntityManager.getEntityIdFromPath(invalidatedPath);
    const targetModelName = `${entityId}${isModel ? "Model" : "Frame"}`;
    const toRemove = registeredApis.filter((api) => api.modelName === targetModelName);
    for (const api of toRemove) {
      const idx = registeredApis.indexOf(api);
      if (idx !== -1) {
        registeredApis.splice(idx, 1);
      }
    }

    return toRemove;
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
    await Sonamu.workflows.synchronize(this.workflows);
  }

  async autoloadSsrRoutes(): Promise<void> {
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
   *
   * @param diffFilePaths - 변경된 파일들의 절대 경로 목록
   * @returns diffTypes - 변경된 파일의 타입 목록 (entity, types, model 등)
   */
  async doSyncActions(diffFilePaths: AbsolutePath[]): Promise<{ diffTypes: FileType[] }> {
    const diffGroups = this.calculateDiffGroups(diffFilePaths);
    const diffTypes = Object.keys(diffGroups) as FileType[];

    // 여기는 별로 중요한 파트는 아닙니다.
    // 아래의 if 전개를 깔끔하게 하려고 만든 DSL 같은 거라서, 무시하셔도 됩니다.
    const { changeMatches, nothingMatches, unhandledPaths } = this.changeMatcher(
      diffTypes,
      diffGroups,
    );

    if (changeMatches("entity", "types")) {
      await this.handleTruthSourceChanges(diffGroups);
    }

    if (changeMatches("model", "frame")) {
      await this.handleImplementationChanges(diffGroups);
    }

    if (changeMatches("types", "functions")) {
      await this.handleAuxiliarySymbolChanges(diffGroups);
    }

    if (changeMatches("config")) {
      await this.handleConfigChanges(diffGroups);
    }

    if (changeMatches("i18n", "entity" /*레이블*/, "config" /*defaultLocale등*/)) {
      await this.handleSonamuDictionaryRelatedChanges(diffGroups);
    }

    const metadataChanged = diffTypes.some((type) =>
      ["entity", "types", "model", "frame", "config"].includes(type),
    );
    if (changeMatches("httpValidatorsGenerated") && !metadataChanged) {
      // registry 자체 drift는 최신 in-memory metadata로 즉시 덮어써 lock 갱신 전에 정합성을 복구합니다.
      await SyncerActions.actionGenerateHttpValidators();
    }

    if (metadataChanged) {
      // 모든 생성/복사 액션 뒤 최신 metadata를 다시 읽어 registry를 한 번만 확정합니다.
      await this.autoloadTypes();
      await this.autoloadModels();
      await this.autoloadApis();
      await SyncerActions.actionGenerateHttpValidators();
    }

    if (nothingMatches()) {
      // 파일 변경은 감지되었으나 저 위 어느 changeMatches에도 걸리지 않은 파일들이 drifts입니다.
      // syncer는 소스의 변경에는 반응하지만 산출물의 변경(drift)에는 직접적으로 반응하지 않습니다.
      // 대신 이 drift에 대해 경고 정도만 출력해줍니다.
      await this.handleDrifts(unhandledPaths());
    }

    return {
      diffTypes,
    };
  }

  calculateDiffGroups(diffFiles: AbsolutePath[]): DiffGroups {
    const patternGroup = getChecksumPatternGroup();
    const fileTypes = Object.keys(patternGroup) as FileType[];

    return group(diffFiles, (filePath) => {
      // 절대 경로 → appRoot 기준 상대 경로 (예: "api/src/...", "web/src/...")
      const relativePath = path.relative(Sonamu.appRootPath, filePath);
      if (relativePath.startsWith("..")) return "unknown";

      for (const fileType of fileTypes) {
        if (minimatch(relativePath, patternGroup[fileType])) {
          return fileType;
        }
      }
      return "unknown";
    }) as unknown as DiffGroups;
  }

  private changeMatcher(diffTypes: FileType[], diffGroups: DiffGroups) {
    const handled = new Set<FileType>();

    /**
     * 변경 사항이 인자로 받은 FileType들 중 하나 이상을 포함하는지 확인합니다.
     * 가령 ["entity"]가 변경된 호출에서 changeMatches("entity")는 trye를 반환하며,
     * ["types", "i18n"]이 변경된 호출에서 changeMatches("types", "functions")도 true를 반환하지만,
     * ["functions"]가 변경된 호출에서 changeMatches("frame")은 false를 반환합니다.
     * @param types
     */
    const changeMatches = (...types: FileType[]) => {
      const matching = types.filter((t) => diffTypes.includes(t));
      matching.forEach((t) => handled.add(t));
      return matching.length > 0;
    };

    /**
     * changeMatches로 매칭된 것이 하나도 없는지 여부를 가져옵니다.
     */
    const nothingMatches = () => handled.size === 0;

    /**
     * 어떤 changeMatches 호출에도 걸리지 않은 FileType들의 실제 파일 경로를 모아서 반환합니다.
     */
    const unhandledPaths = (): AbsolutePath[] =>
      diffTypes.filter((t) => !handled.has(t)).flatMap((t) => diffGroups[t] ?? []);

    return { changeMatches, nothingMatches, unhandledPaths };
  }

  async handleTruthSourceChanges(diffGroups: DiffGroups): Promise<void> {
    Naite.t("handleTruthSourceChanges", { diffGroups });

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
      ) as AbsolutePath;

      if (entity.parentId === undefined && !(await exists(typeFilePath))) {
        // *.types.ts가 만들어집니다.
        const types = await SyncerActions.actionGenerateInitialTypes(entityId);

        // 그걸 타겟에 갖다둬요.
        await SyncerActions.actionSyncFilesToTargets(types);
      }
    }

    // sonamu.generated.ts와 sonamu.generated.sso.ts가 만들어집니다.
    const generated = await SyncerActions.actionGenerateSchemas();

    // 모든 것들을 target에 보내지는 않습니다.
    // sonamu.generated.sso.ts는 service-side-only니까 배제합니다.
    // TODO(병준): 이 하드코드를 누가 해결 좀 해주세요. 일단은 감당 가능하니 놔두겠습니다...
    const distributable = generated.filter((p) => !p.endsWith(".sso.ts"));

    // 이제 보낼 것들만 target에 보내요.
    await SyncerActions.actionSyncFilesToTargets(distributable);
  }

  async handleImplementationChanges(diffGroups: DiffGroups): Promise<void> {
    Naite.t("handleImplementationChanges", { diffGroups });
    const mergedGroup = [...(diffGroups.model ?? []), ...(diffGroups.frame ?? [])];

    // generated_http.template.ts에서 syncer.types를 씁니다.
    // service.template.ts에서 syncer.apis를 씁니다.
    await this.autoloadModels();
    await this.autoloadTypes();
    await this.autoloadApis();

    const params: {
      namesRecord: EntityNamesRecord;
    }[] = mergedGroup.map((modelPath) => {
      if (modelPath.endsWith(".model.ts") || modelPath.endsWith(".frame.ts")) {
        const entityId = EntityManager.getEntityIdFromPath(modelPath);
        assert(entityId);
        return {
          namesRecord: EntityManager.getNamesFromId(entityId),
        };
      }
      throw new Error("not reachable");
    });

    await SyncerActions.actionGenerateServices(params);
    await SyncerActions.actionGenerateHttps();
    await SyncerActions.actionGenerateSsrQueries();
  }

  async handleAuxiliarySymbolChanges(diffGroups: DiffGroups): Promise<void> {
    Naite.t("handleAuxiliarySymbolChanges", { diffGroups });
    const tsPaths = unique([...(diffGroups.types ?? []), ...(diffGroups.functions ?? [])]);
    await SyncerActions.actionSyncFilesToTargets(tsPaths);
  }

  async handleConfigChanges(_: DiffGroups): Promise<void> {
    if (process.env.HOT === "yes") {
      const { loadConfig } = await import("../api/config");
      Sonamu.config = await loadConfig(Sonamu.apiRootPath);
    }
    await SyncerActions.actionSyncConfig();
  }

  async handleSonamuDictionaryRelatedChanges(_: DiffGroups): Promise<void> {
    await SyncerActions.actionSyncSonamuDictionary();
  }

  async handleDrifts(drifts: AbsolutePath[]): Promise<void> {
    if (drifts.length > 0) {
      console.warn(
        chalk.yellow(
          "⚠️ Sonamu가 자동 생성한 파일에 대한 변경이 감지되었습니다. 파일이 Sonamu watcher 외부에서 변경된 것으로 추정됩니다.",
        ),
      );
      for (const p of drifts) {
        console.warn(chalk.yellow(`  - ${path.relative(Sonamu.appRootPath, p)}`));
      }
      console.warn(chalk.dim("  → `pnpm sonamu sync --force`를 권장합니다."));
    }
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
      [name: string]: z.ZodEnum;
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
}
