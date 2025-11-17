import path, { dirname } from "path";
import { globAsync } from "../utils/async-utils";
import { importMembersFresh } from "../utils/esm-utils";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { exists } from "../utils/fs-utils";

import * as _ from "lodash-es";
import { EntityManager, EntityNamesRecord } from "../entity/entity-manager";
import { ApiParam, ApiParamType, GenerateOptions } from "../types/types";
import { ApiDecoratorOptions } from "../api/decorators";
import { z } from "zod";
import chalk from "chalk";
import { TemplateKey, TemplateOptions } from "../types/types";
import { BadRequestException } from "../exceptions/so-exceptions";
import { Sonamu } from "../api/sonamu";
import assert from "assert";
import { minimatch } from "minimatch";
import { mapAsync, reduceAsync } from "../utils/async-utils";
import { centerText } from "../utils/console-util";
import { runWithGracefulShutdown } from "../utils/process-utils";
import {
  AbsolutePath,
  toAbsolutePath,
  toProjectRelativePath,
} from "../utils/path-utils";
import { generateTemplate, renderTemplate } from "./template";
import { readApisFromFile } from "./api-parsing";
import { BaseFrameClass } from "../api/base-frame";
import { BaseModelClass } from "../database/base-model";
import { Template } from "../template";
import { FileType, getChecksumPatternGroupInAbsolutePath } from "./config";
import {
  findChangedFilesUsingChecksums,
  renewChecksums,
  areFilesSame,
} from "./checksum";

type DiffGroups = {
  [key in FileType]: AbsolutePath[];
};

export class Syncer {
  apis: {
    typeParameters: ApiParamType.TypeParam[];
    parameters: ApiParam[];
    returnType: ApiParamType;
    modelName: string;
    methodName: string;
    path: string;
    options: ApiDecoratorOptions;
  }[] = [];
  types: { [typeName: string]: z.ZodObject<any> } = {};
  models: { [modelName: string]: BaseModelClass | BaseFrameClass } = {};
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
      { whenThisHappens: "SIGUSR2", waitForUpTo: 20000 }
    );
  }

  /**
   * 주어진 변경 파일들 중 체크섬 관리 대상인 것들만 가져다가 싱크를 진행합니다.
   * 체크섬 파일 업데이트는 여기에서 하지 않습니다. 호출자가 합니다.
   * @param diffFilePaths - 변경 파일들. 프로젝트 루트부터 "src/" 또는 "dist/"로 시작하는 상대 경로입니다. 예시: "src/application/user/user.model.ts"
   */
  async syncFromWatcher(diffFilePaths: AbsolutePath[]): Promise<void> {
    // watcher가 가져온 변경 알림 중, 우리가 관심있는 것들만 뽑아옵니다.
    const targetFilePaths = diffFilePaths.filter((filePath) =>
      Object.values(getChecksumPatternGroupInAbsolutePath()).some((pattern) =>
        minimatch(filePath, pattern)
      )
    );

    // 싱크 작업 수행하는 본체입니다.
    await this.doSyncActions(targetFilePaths);

    // 싱크 작업이 끝나면 모든 모듈을 리로드합니다.
    await this.clearAndLoadModules();

    this.syncUI();
  }

  private async copySharedToTargets(targets: string[]): Promise<void> {
    for (const target of targets) {
      // 지금 가져가려는 이 파일은 Sonamu 코드베이스의 일부입니다.
      // 그런데 dist 속 빌드된 소스 코드 파일이 필요한 것이 아니고, src에만 있는 텍스트 파일이 필요합니다.
      // 따라서 /src/에서 찾습니다.
      const srcPath = path.join(
        import.meta.dirname.replace("/dist/", "/src/"),
        `../shared/${target}.shared.ts.txt`
      );
      if (!(await exists(srcPath))) {
        return;
      }

      const destPath = path.join(
        Sonamu.appRootPath,
        target,
        "src/services/sonamu.shared.ts"
      );

      if (await areFilesSame(srcPath, destPath)) {
        return;
      }

      await writeFile(destPath, await readFile(srcPath));

      console.log(
        chalk.bold("Copied: ") +
          chalk.blue(destPath.replace(Sonamu.appRootPath + "/", ""))
      );
    }
  }

  /**
   * 실제 싱크를 수행하는 본체입니다.
   * @param diffFiles
   * @returns
   */
  private async doSyncActions(
    diffFilePaths: AbsolutePath[]
  ): Promise<{ diffTypes: string[] }> {
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

    return {
      diffTypes,
    };
  }

  private calculateDiffGroups(diffFiles: AbsolutePath[]): DiffGroups {
    return _.groupBy(diffFiles, (r) => {
      const matched = r.match(
        /\.(model|types|functions|entity|generated|frame)\.[tj]s/
      );
      return matched?.[1] ?? "unknown";
    }) as unknown as DiffGroups;
  }

  private async handleEntityChange(
    diffGroups: DiffGroups,
    diffTypes: string[]
  ): Promise<void> {
    console.log(
      chalk.gray(
        `[Processing] Handling entity changes: ${diffGroups["entity"]?.map(toProjectRelativePath).join(", ")}`
      )
    );

    await EntityManager.reload();

    // types 생성(entity 새로 추가된 경우)
    // parentId가 없고, types가 없는 경우에만 생성
    const entityId = EntityManager.getEntityIdFromPath(
      diffGroups["entity"]?.[0]
    );

    console.log(chalk.cyan(`entityId: ${entityId}`));

    if (entityId) {
      const entity = EntityManager.get(entityId);
      const typeFilePath = toAbsolutePath(
        `src/application/${entity.names.fs}/${entity.names.fs}.types.ts`
      );
      if (entity.parentId === undefined && !(await exists(typeFilePath))) {
        await generateTemplate("init_types", { entityId });
      }
    }

    await this.actionGenerateSchemas();

    diffGroups["generated"] = _.uniq([
      ...(diffGroups["generated"] ?? []),
      toAbsolutePath("src/application/sonamu.generated.ts"),
    ]);
    diffTypes.push("generated");
  }

  private async handleTypesOrFunctionsOrGeneratedChange(
    diffGroups: DiffGroups
  ): Promise<FileType[]> {
    const tsPaths = _.uniq([
      ...(diffGroups["types"] ?? []),
      ...(diffGroups["functions"] ?? []),
      ...(diffGroups["generated"] ?? []),
    ]);

    console.log(
      chalk.gray(
        `[Processing] Handling types/functions/generated changes: ${tsPaths.map(toProjectRelativePath).join(", ")}`
      )
    );

    await this.actionSyncFilesToTargets(tsPaths);

    return [];
  }

  private async handleModelOrFrameChange(
    diffGroups: DiffGroups
  ): Promise<void> {
    const mergedGroup = [
      ...(diffGroups["model"] ?? []),
      ...(diffGroups["frame"] ?? []),
    ];

    console.log(
      chalk.gray(
        `[Processing] Handling model/frame changes: ${mergedGroup.map(toProjectRelativePath).join(", ")}`
      )
    );

    // generated_http.template.ts에서 syncer.types를 씁니다.
    // service.template.ts에서 syncer.apis를 씁니다.
    await this.clearAndLoadModules();
   
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

  async actionGenerateSchemas(): Promise<string[]> {
    return (
      await Promise.all([
        generateTemplate("generated_sso", {}, { overwrite: true }),
        generateTemplate("generated", {}, { overwrite: true }),
      ])
    )
      .flat()
      .flat();
  }

  async actionGenerateServices(
    paramsArray: {
      namesRecord: EntityNamesRecord;
    }[]
  ): Promise<string[]> {
    return (
      await Promise.all(
        paramsArray.map(async (params) =>
          generateTemplate("service", params, {
            overwrite: true,
          })
        )
      )
    )
      .flat()
      .flat();
  }

  async actionGenerateHttps(): Promise<string[]> {
    const [res] = await generateTemplate(
      "generated_http",
      {},
      { overwrite: true }
    );
    assert(res);
    return res;
  }

  async copyFileWithReplaceCoreToShared(fromPath: string, toPath: string) {
    if (!(await exists(fromPath))) {
      return;
    }

    const oldFileContent = (await readFile(fromPath)).toString();

    const newFileContent = (() => {
      const nfc = oldFileContent.replace(
        /from "sonamu"/g,
        `from "src/services/sonamu.shared"`
      );

      if (toPath.includes("/web/")) {
        return nfc; // .replace(/from "lodash";/g, `from "lodash-es";`); // TODO 흠? 필요없을듯.
      } else {
        return nfc;
      }
    })();
    return writeFile(toPath, newFileContent);
  }

  private async actionSyncFilesToTargets(
    tsPaths: AbsolutePath[]
  ): Promise<string[]> {
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
                chalk.bold("Copied: ") +
                  chalk.blue(dst.replace(Sonamu.appRootPath + "/", ""))
              );
              await this.copyFileWithReplaceCoreToShared(realSrc, dst);
              return dst;
            })
          )
        )
      )
    ).flat();
  }

  async clearAndLoadModules() {
    this.apis = [];
    this.types = {};
    this.models = {};
    await this.loadTypes();
    await this.loadModels();
    await this.loadApis(); // service.template.ts에서 syncer.apis를 씁니다.
  }

  async loadApis() {
    const modelPathsPattern = path.join(
      Sonamu.apiRootPath,
      "src/application/**/*.{model,frame}.ts"
    );
    const modelPaths = (await globAsync(modelPathsPattern)) as AbsolutePath[];

    let count = 0;
    for (const filePath of modelPaths) {
      const apis = await readApisFromFile(filePath);
      this.apis.push(...apis);
      count++;
    }
    console.log(
      chalk.gray(
        `[Loading] Loaded APIs from "*.model.ts" files: ${count} files.`
      )
    );

    return this.apis;
  }

  async loadModels() {
    const modelPathsPattern = path.join(
      Sonamu.apiRootPath,
      "src/application/**/*.{model,frame}.ts"
    );
    const modelPaths = await globAsync(modelPathsPattern);

    let count = 0;
    for (const filePath of modelPaths) {
      const importedMembers = await importMembersFresh<
        BaseModelClass | BaseFrameClass
      >(filePath);

      for (const { name, value } of importedMembers) {
        if (name.endsWith("Model") || name.endsWith("Frame")) {
          this.models[name] = value;
        }
      }
      count++;
    }
    console.log(
      chalk.gray(
        `[Loading] Loaded model/frame instances from "*.{model,frame}.ts" files: ${count} files.`
      )
    );

    return this.models;
  }

  async loadTypes(): Promise<{ [typeName: string]: z.ZodObject<any> }> {
    const typePathsPatterns = [
      path.join(Sonamu.apiRootPath, "/src/application/**/*.types.ts"),
      path.join(Sonamu.apiRootPath, "/src/application/**/*.generated.ts"),
    ];
    const typePaths = (
      await Promise.all(typePathsPatterns.map(globAsync))
    ).flat();

    let count = 0;
    for (const filePath of typePaths) {
      const importedMembers =
        await importMembersFresh<z.ZodObject<any>>(filePath);
      for (const { name, value } of importedMembers) {
        if (value instanceof z.ZodObject) {
          this.types[name] = value;
        }
      }
      count++;
    }
    console.log(
      chalk.gray(
        `[Loading] Loaded zod types from "*.types.ts" files: ${count} files.`
      )
    );

    return this.types;
  }

  async checkExistsGenCode(
    entityId: string,
    templateKey: TemplateKey,
    enumId?: string
  ): Promise<{ subPath: string; fullPath: string; isExists: boolean }> {
    const { target, path: genPath } = Template.find(
      templateKey
    ).getTargetAndPath(EntityManager.getNamesFromId(entityId), enumId);

    const fullPath = path.join(Sonamu.appRootPath, target, genPath);
    const subPath = path.join(target, genPath);
    return {
      subPath,
      fullPath,
      isExists: await exists(fullPath),
    };
  }

  async checkExists(
    entityId: string,
    enums: {
      [name: string]: z.ZodEnum<any>;
    }
  ): Promise<Record<`${TemplateKey}${string}`, boolean>> {
    const keys: TemplateKey[] = TemplateKey.options;
    const names = EntityManager.getNamesFromId(entityId);
    const enumsKeys = Object.keys(enums).filter(
      (name) => name !== names.constant
    );

    return await reduceAsync(
      keys,
      async (result, key) => {
        const tpl = Template.find(key);
        if (key.startsWith("view_enums")) {
          await mapAsync(enumsKeys, async (componentId) => {
            const { target, path: p } = tpl.getTargetAndPath(
              names,
              componentId
            );
            result[`${key}__${componentId}`] = await exists(
              path.join(Sonamu.appRootPath, target, p)
            );
          });
          return result;
        }

        const { target, path: p } = tpl.getTargetAndPath(names);
        const { targets } = Sonamu.config.sync;
        if (target.includes(":target")) {
          await mapAsync(targets, async (t) => {
            result[`${key}__${t}`] = await exists(
              path.join(Sonamu.appRootPath, target.replace(":target", t), p)
            );
          });
        } else {
          result[key] = await exists(path.join(Sonamu.appRootPath, target, p));
        }

        return result;
      },
      {} as Record<`${TemplateKey}${string}`, boolean>
    );
  }

  async createEntity(
    form: Omit<TemplateOptions["entity"], "title"> & { title?: string }
  ) {
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(form.entityId)) {
      throw new BadRequestException("entityId는 CamelCase 형식이어야 합니다.");
    }

    await generateTemplate("entity", form);

    // reload entities
    await EntityManager.reload();
  }

  async delEntity(entityId: string): Promise<{ delPaths: string[] }> {
    const entity = EntityManager.get(entityId);

    const delPaths = (() => {
      if (entity.parentId) {
        return [
          `${Sonamu.apiRootPath}/src/application/${entity.names.parentFs}/${entity.names.fs}.entity.json`,
        ];
      } else {
        return [
          `${Sonamu.apiRootPath}/src/application/${entity.names.fs}`,
          `${Sonamu.apiRootPath}/dist/application/${entity.names.fs}`,
          ...Sonamu.config.sync.targets
            .map((target) => [
              `${Sonamu.appRootPath}/${target}/src/services/${entity.names.fs}`,
            ])
            .flat(),
        ];
      }
    })(); // iife

    for await (const delPath of delPaths) {
      if (await exists(delPath)) {
        console.log(chalk.red(`DELETE ${delPath}`));
        await rm(delPath, { recursive: true, force: true });
      } else {
        console.log(chalk.yellow(`NOT_EXISTS ${delPath}`));
      }
    }

    // reload entities
    await EntityManager.reload();

    return { delPaths };
  }

  syncUI() {
    const uiPort = Sonamu.config.ui?.port ?? 57000;

    fetch(`http://127.0.0.1:${uiPort}/api/reload`, {
      method: "GET",
    }).catch((e) =>
      console.log(chalk.dim(`Failed to reload Sonamu UI: ${e.message}`))
    );
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async generateTemplate(
    key: TemplateKey,
    templateOptions: any,
    _generateOptions?: GenerateOptions
  ) {
    return await generateTemplate(key, templateOptions, _generateOptions);
  }

  /**
   * 하위호환용 프록시 메소드입니다.
   */
  async renderTemplate(key: TemplateKey, templateOptions: any) {
    return await renderTemplate(key, templateOptions);
  }

  async renewChecksums(): Promise<void> {
    return await renewChecksums();
  }
}
