import { hot } from "@sonamu-kit/hot-hook";
import assert from "assert";
import chalk from "chalk";
import { mkdir, readFile, writeFile } from "fs/promises";
import { minimatch } from "minimatch";
import path, { dirname } from "path";
import { group, unique } from "radashi";
import type { z } from "zod";
import { registeredApis } from "../api/decorators";
import { Sonamu } from "../api/sonamu";
import { EntityManager, type EntityNamesRecord } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import { Template } from "../template/template";
import type { GenerateOptions } from "../types/types";
import { TemplateKey, type TemplateOptions } from "../types/types";
import { mapAsync, reduceAsync } from "../utils/async-utils";
import { centerText } from "../utils/console-util";
import { exists } from "../utils/fs-utils";
import type { AbsolutePath } from "../utils/path-utils";
import { runWithGracefulShutdown } from "../utils/process-utils";
import { areFilesSame, findChangedFilesUsingChecksums, renewChecksums } from "./checksum";
import { generateTemplate, renderTemplate } from "./code-generator";
import { createEntity, delEntity } from "./entity-operations";
import { type FileType, getChecksumPatternGroupInAbsolutePath } from "./file-patterns";
import {
  type LoadedApis,
  type LoadedModels,
  type LoadedTypes,
  loadApis,
  loadModels,
  loadTypes,
} from "./module-loader";

type DiffGroups = {
  [key in FileType]: AbsolutePath[];
};

export class Syncer {
  apis: LoadedApis = [];
  types: LoadedTypes = {};
  models: LoadedModels = {};
  isSyncing: boolean = false;

  /**
   * 체크섬이 변경된 부분에 대해 싱크를 진행합니다.
   * 다만 sonamu.shared.ts는 체크섬 비교 없이 무조건 싱크(복사)합니다.
   * @returns
   */
  async sync(): Promise<void> {
    const { targets } = Sonamu.config.sync;

    // sonamu.shared.ts는 무조건 싱크(복사)합니다.
    await this.copySharedToTargets(targets);

    // 그 다음부터는 변경된 파일을 찾아서 동기화 작업을 실행합니다.
    const changedFiles = await findChangedFilesUsingChecksums();
    if (changedFiles.length === 0) {
      console.log(chalk.black.bgGreen(centerText("All files are synced!")));
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

    // 일단 변경된 파일과 dependent 파일들을 invalidate 합니다.
    // 한 번 이상 import된 친구들에 대해서만 실제 작업이 일어납니다.
    // 그러니 안심하고 invalidate 해도 됩니다.
    const invalidatedPaths = (await hot.invalidateFile(diffFilePath, event)) as AbsolutePath[];
    if (invalidatedPaths.length > 0) {
      console.log(chalk.bold(`🔄 Invalidated:`));

      for (const invalidatedPath of invalidatedPaths) {
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
      }
    }

    const isInCheckPatternGroup = Object.values(getChecksumPatternGroupInAbsolutePath()).some(
      (pattern) => minimatch(diffFilePath, pattern),
    );

    // 할 일(sync)이 있으면 합니다.
    if (isInCheckPatternGroup) {
      await this.doSyncActions([diffFilePath]);
    }

    // 싱크 작업이 끝나면 모든 모듈을 로드합니다.
    // hot-hook에 의해 invalidate된 부분들이 아니라면 캐시 그대로 유지합니다.
    await this.autoloadTypes();
    await this.autoloadModels();
    await this.autoloadApis();

    this.syncUI();
  }

  private removeInvalidatedRegisteredApis(
    invalidatedPath: AbsolutePath,
  ): (typeof registeredApis)[number][] {
    if (!invalidatedPath.endsWith(".model.ts" /*소스 코드를 다루는 상황이니 .ts 경로로 봅니다.*/)) {
      return [];
    }

    const entityId = EntityManager.getEntityIdFromPath(invalidatedPath);
    const toRemove = registeredApis.filter((api) => api.modelName === `${entityId}Model`);
    for (const api of toRemove) {
      registeredApis.splice(registeredApis.indexOf(api), 1);
    }

    return toRemove;
  }

  private async copySharedToTargets(targets: string[]): Promise<void> {
    for (const target of targets) {
      // 지금 가져가려는 이 파일은 Sonamu 코드베이스의 일부입니다.
      // 그런데 dist 속 빌드된 소스 코드 파일이 필요한 것이 아니고, src에만 있는 텍스트 파일이 필요합니다.
      // 따라서 /src/에서 찾습니다.
      const srcPath = path.join(
        import.meta.dirname.replace("/dist/", "/src/"),
        `../shared/${target}.shared.ts.txt`,
      );
      if (!(await exists(srcPath))) {
        return;
      }
      if (!(await exists(path.join(Sonamu.appRootPath, target)))) {
        throw new Error(
          `Tried to copy sonamu.shared.ts to target '${target}' but the target directory does not exist. Please check your project directory structure.`,
        );
      }

      // 이건 프로젝트에 .ts 소스 코드 파일을 생성하는 것이므로 src의 .ts 경로로 갑니다.
      const destPath = path.join(Sonamu.appRootPath, target, "src/services/sonamu.shared.ts");

      // 정말 혹시나지만 target 디렉토리는 있어도 src/services 디렉토리는 없을 수 있으므로 미리 생성해줍니다.
      if (!(await exists(path.dirname(destPath)))) {
        await mkdir(path.dirname(destPath), { recursive: true });
        console.warn(`Created directory '${path.dirname(destPath)}' because it did not exist.`);
      }

      if (await areFilesSame(srcPath, destPath)) {
        return;
      }

      await writeFile(destPath, await readFile(srcPath));

      console.log(chalk.bold("Copied: ") + chalk.blue(path.relative(Sonamu.appRootPath, destPath)));
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

  /**
   * 실제 싱크를 수행하는 본체입니다.
   * 변경된 파일들을 타입별로 분류하고 각 타입에 맞는 액션을 실행합니다.
   * @param diffFilePaths - 변경된 파일들의 절대 경로 목록
   * @returns diffTypes - 변경된 파일의 타입 목록 (entity, types, model 등)
   */
  private async doSyncActions(diffFilePaths: AbsolutePath[]): Promise<{ diffTypes: string[] }> {
    const diffGroups = this.calculateDiffGroups(diffFilePaths);
    const diffTypes = Object.keys(diffGroups);

    // 트리거: entity, types
    // 액션: 스키마 생성
    if (diffTypes.includes("entity")) {
      await this.handleEntityChange(diffGroups, diffTypes);
    }

    // 트리거: types, enums, generated 변경시
    // 액션: 파일 싱크 types, enums, generated
    if (
      diffTypes.includes("types") ||
      diffTypes.includes("functions") ||
      diffTypes.includes("generated")
    ) {
      await this.handleTypesOrFunctionsOrGeneratedChange(diffGroups);
    }

    // 트리거: model
    if (diffTypes.includes("model") || diffTypes.includes("frame")) {
      await this.handleModelOrFrameChange(diffGroups);
    }

    // 트리거: config
    if (diffTypes.includes("config")) {
      await this.actionSyncConfig();
    }

    return {
      diffTypes,
    };
  }

  private calculateDiffGroups(diffFiles: AbsolutePath[]): DiffGroups {
    Naite.t("step", "doSyncActions");
    return group(diffFiles, (r) => {
      const matched = r.match(/\.(model|types|functions|entity|generated|frame|config)\.[tj]s/);
      return matched?.[1] ?? "unknown";
    }) as unknown as DiffGroups;
  }

  public async handleEntityChange(diffGroups: DiffGroups, diffTypes: string[]): Promise<void> {
    Naite.t("step", "handleEntityChange");
    Naite.t("handleEntityChange", { diffGroups, diffTypes });

    await EntityManager.reload();

    // types 생성(entity 새로 추가된 경우)
    // parentId가 없고, types가 없는 경우에만 생성
    const entityId = EntityManager.getEntityIdFromPath(diffGroups.entity?.[0]);

    if (entityId) {
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

    await this.actionGenerateSchemas();

    diffGroups.generated = unique([
      ...(diffGroups.generated ?? []),
      path.join(Sonamu.apiRootPath, "src/application/sonamu.generated.ts") as AbsolutePath,
    ]);
    diffTypes.push("generated");
  }

  private async handleTypesOrFunctionsOrGeneratedChange(
    diffGroups: DiffGroups,
  ): Promise<FileType[]> {
    const tsPaths = unique([
      ...(diffGroups.types ?? []),
      ...(diffGroups.functions ?? []),
      ...(diffGroups.generated ?? []),
    ]);
    Naite.t("step", "handleTypesOrFunctionsOrGeneratedChange");
    Naite.t("handleTypesOrFunctionsOrGeneratedChange", { diffGroups });

    // console.log(
    //   chalk.gray(
    //     `[Processing] Handling types/functions/generated changes: ${tsPaths.map((p) => path.relative(Sonamu.apiRootPath, p)).join(", ")}`
    //   )
    // );

    await this.actionSyncFilesToTargets(tsPaths);

    return [];
  }

  async handleModelOrFrameChange(diffGroups: DiffGroups): Promise<void> {
    Naite.t("step", "handleModelOrFrameChange");
    Naite.t("handleModelOrFrameChange", { diffGroups });
    const mergedGroup = [...(diffGroups.model ?? []), ...(diffGroups.frame ?? [])];

    // console.log(
    //   chalk.gray(
    //     `[Processing] Handling model/frame changes: ${mergedGroup.map((p) => path.relative(Sonamu.apiRootPath, p)).join(", ")}`
    //   )
    // );

    // generated_http.template.ts에서 syncer.types를 씁니다.
    // service.template.ts에서 syncer.apis를 씁니다.
    Naite.t("step", "autoloadModels");
    await this.autoloadModels();
    Naite.t("step", "autoloadTypes");
    await this.autoloadTypes();
    Naite.t("step", "autoloadApis");
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
      if (modelPath.endsWith("frame.ts")) {
        const [, frameName] = modelPath.match(/.+\/(.+)\.frame.js$/) ?? [];
        assert(frameName);
        return {
          namesRecord: EntityManager.getNamesFromId(frameName),
        };
      }
      throw new Error("not reachable");
    });

    await this.actionGenerateServices(params);
    await this.actionGenerateHttps();
  }

  // web/.sonamu.env 에 현재 설정값 저장
  async actionSyncConfig() {
    Naite.t("step", "actionSyncConfig");
    const { host, port } = Sonamu.config.server.listen ?? {};
    const content = `API_HOST=${host ?? "localhost"}\nAPI_PORT=${port ?? 3000}`;

    Naite.t("actionSyncConfig", { content });
    await Promise.all(
      Sonamu.config.sync.targets.map(async (target) => {
        await writeFile(path.join(Sonamu.appRootPath, target, ".sonamu.env"), content);
      }),
    );
  }

  /**
   * sonamu.generated.ts와 sonamu.generated.sso.ts를 생성합니다.
   * @returns 생성된 파일 경로 배열.
   */
  private async actionGenerateSchemas(): Promise<AbsolutePath[]> {
    Naite.t("step", "actionGenerateSchemas");
    return (
      await Promise.all([
        generateTemplate("generated_sso", {}, { overwrite: true }),
        generateTemplate("generated", {}, { overwrite: true }),
      ])
    )
      .flat()
      .flat();
  }

  /**
   * *.service.ts를 생성합니다.
   * @param paramsArray
   * @returns 생성된 파일 경로 배열.
   */
  private async actionGenerateServices(
    paramsArray: {
      namesRecord: EntityNamesRecord;
    }[],
  ): Promise<string[]> {
    Naite.t("step", "actionGenerateServices");
    Naite.t("actionGenerateServices", paramsArray);
    return (
      await Promise.all(
        paramsArray.map(async (params) =>
          generateTemplate("service", params as TemplateOptions["service"], {
            overwrite: true,
          }),
        ),
      )
    )
      .flat()
      .flat();
  }

  /**
   * sonamu.generated.http를 생성합니다.
   * @returns 생성된 파일 경로.
   */
  private async actionGenerateHttps(): Promise<AbsolutePath> {
    const [res] = await generateTemplate(
      "generated_http",
      { entityId: "dummy" },
      { overwrite: true },
    );
    assert(res);
    return res;
  }

  /**
   * *.types.ts, *.functions.ts, *.generated.ts를 타겟 디렉토리에 복사합니다.
   * @param tsPaths
   * @returns 복사된 파일 경로 배열.
   */
  private async actionSyncFilesToTargets(tsPaths: AbsolutePath[]): Promise<string[]> {
    const { targets } = Sonamu.config.sync;
    const { dir: apiDir } = Sonamu.config.api;

    return (
      await Promise.all(
        targets.map(async (target) =>
          Promise.all(
            tsPaths.map(async (realSrc) => {
              const dst = realSrc
                .replace(`/${apiDir}/`, `/${target}/`)
                .replace("/application/", "/services/");
              const dir = dirname(dst);
              if (!(await exists(dir))) {
                await mkdir(dir, { recursive: true });
              }
              console.log(
                chalk.bold("Copied: ") + chalk.blue(dst.replace(`${Sonamu.appRootPath}/`, "")),
              );
              await this.copyFileWithReplaceCoreToShared(realSrc, dst);
              return dst;
            }),
          ),
        ),
      )
    ).flat();
  }

  private async copyFileWithReplaceCoreToShared(fromPath: string, toPath: string) {
    if (!(await exists(fromPath))) {
      return;
    }

    const oldFileContent = (await readFile(fromPath)).toString();

    const newFileContent = (() => {
      const nfc = oldFileContent.replace(/from "sonamu"/g, `from "src/services/sonamu.shared"`);
      return nfc;
    })();
    return writeFile(toPath, newFileContent);
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
    const { target, path: genPath } = Template.find(templateKey).getTargetAndPath(
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
        const tpl = Template.find(key);
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

  syncUI() {
    const uiPort = Sonamu.config.ui?.port ?? 57000;

    fetch(`http://127.0.0.1:${uiPort}/api/reload`, {
      method: "GET",
    }).catch((e) => console.log(chalk.dim(`Failed to reload Sonamu UI: ${e.message}`)));
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
  ) {
    return await generateTemplate(key, templateOptions, _generateOptions);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async renderTemplate<T extends keyof TemplateOptions>(
    key: T,
    templateOptions: TemplateOptions[T],
  ) {
    return await renderTemplate(key, templateOptions);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async renewChecksums(): Promise<void> {
    return await renewChecksums();
  }
}
