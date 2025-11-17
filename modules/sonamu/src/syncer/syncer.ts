import path, { dirname } from "path";
import { globAsync, importFresh } from "../utils/utils";
import { createReadStream, PathLike } from "fs";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { exists } from "../utils/fs-utils";

import crypto from "crypto";
import equal from "fast-deep-equal";
import * as _ from "lodash-es";
import inflection from "inflection";
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
  ProjectRelativePath,
  toAbsolutePath,
  toProjectRelativePath,
} from "../utils/path-utils";
import { generateTemplate, getTemplate, renderTemplate } from "./template";
import { readApisFromFile } from "./ast-parsing";
import { BaseFrameClass } from "../api/base-frame";
import { BaseModelClass } from "../database/base-model";

type FileType =
  | "model"
  | "types"
  | "functions"
  | "generated"
  | "entity"
  | "frame";
type GlobPattern<T extends ProjectRelativePath | AbsolutePath> = {
  [key in FileType]: T;
};

type PathAndChecksum = {
  path: AbsolutePath;
  checksum: string;
};

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

  public checksumPatternGroup: GlobPattern<ProjectRelativePath> = {
    entity: "src/application/**/*.entity.json",
    types: "src/application/**/*.types.ts",
    generated: "src/application/sonamu.generated.ts",
    model: "src/application/**/*.model.ts",
    frame: "src/application/**/*.frame.ts",
    functions: "src/application/**/*.functions.ts",
  };

  get checksumsPath(): string {
    return path.join(
      Sonamu.apiRootPath,
      "/sonamu.lock" /*TODO 슬래시 빼도 됨*/
    );
  }
  public constructor() {}

  private checksumPatternGroupsInAbsolutePath(): GlobPattern<AbsolutePath> {
    return Object.fromEntries(
      Object.entries(this.checksumPatternGroup).map(([key, value]) => [
        key,
        path.join(Sonamu.apiRootPath, value),
      ])
    ) as GlobPattern<AbsolutePath>;
  }

  /**
   * 주어진 타겟들에 sonamu.shared.ts를 복사합니다.
   * @param targets - 타겟들
   * @returns
   */
  private async copySharedToTargets(targets: string[]): Promise<void> {
    for (const target of targets) {
      const srcCodePath = path
        .join(import.meta.dirname, `../shared/${target}.shared.ts.txt`)
        .replace("/dist/", "/src/");
      if (!(await exists(srcCodePath))) {
        return;
      }

      const dstCodePath = path.join(
        Sonamu.appRootPath,
        target,
        "src/services/sonamu.shared.ts"
      );

      const srcChecksum = await this.getChecksumOfFile(srcCodePath);
      const dstChecksum = await (async () => {
        if (!(await exists(dstCodePath))) {
          return "";
        }
        return this.getChecksumOfFile(dstCodePath);
      })();

      if (srcChecksum === dstChecksum) {
        return;
      }
      await writeFile(dstCodePath, await readFile(srcCodePath));
      console.log(chalk.blue("shared.ts is synced"));
    }
  }

  /**
   * 체크섬 파일에 저장된 내용과 현재 실제 파일의 체크섬을 비교하여 변경된 파일을 찾습니다.
   * @returns 변경된 파일 경로 배열. 프로젝트 루트부터 슬래시로 시작합니다. 예시: "/src/application/user/user.model.ts"
   */
  private async findChangedFilesUsingChecksums(): Promise<AbsolutePath[]> {
    let calculatedChecksums = await this.getCurrentChecksums();
    const savedChecksums = await this.getPreviousChecksums();

    const isSame = equal(calculatedChecksums, savedChecksums);
    if (isSame) {
      return [];
    }

    const diff = _.differenceWith(
      calculatedChecksums,
      savedChecksums,
      _.isEqual
    );

    return diff.map((r) => r.path);
  }

  /**
   * 체크섬을 갱신합니다.
   * 현재 파일들의 체크섬을 계산해서 구한 다음, 체크섬 파일에 저장된 내용과 다르면 체크섬 파일을 갱신합니다.
   * @returns
   */
  async renewChecksums(): Promise<void> {
    let calculatedChecksums = await this.getCurrentChecksums();
    const savedChecksums = await this.getPreviousChecksums();

    const isSame = equal(calculatedChecksums, savedChecksums);
    if (isSame) {
      return;
    }

    await this.saveChecksums(calculatedChecksums);
  }

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
    const changedFiles = await this.findChangedFilesUsingChecksums();
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
        await this.renewChecksums();
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
      Object.values(this.checksumPatternGroupsInAbsolutePath()).some(
        (pattern) => minimatch(filePath, pattern)
      )
    );

    // 싱크 작업 수행하는 본체입니다.
    await this.doSyncActions(targetFilePaths);

    this.apis = [];
    this.types = {};
    this.models = {};
    await this.autoloadTypes();
    await this.autoloadModels();
    await this.autoloadApis();

    this.syncUI();
  }

  /**
   * 실제 싱크를 수행하는 본체입니다.
   * @param diffFiles
   * @returns
   */
  async doSyncActions(
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
    await EntityManager.reload();

    console.log(
      chalk.gray(
        `[Processing] Handling entity changes: ${diffGroups["entity"]?.map(toProjectRelativePath).join(", ")}`
      )
    );

    // types 생성(entity 새로 추가된 경우)
    // parentId가 없고, types가 없는 경우에만 생성
    const entityId = this.getEntityIdFromPath([
      ...(diffGroups["entity"] ?? []),
    ])[0];
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

    await this.autoloadTypes(); // generated_http.template.ts에서 syncer.types를 씁니다.

    const params: {
      namesRecord: EntityNamesRecord;
      modelTsPath: AbsolutePath;
    }[] = mergedGroup.map((modelPath) => {
      if (modelPath.endsWith(".model.ts")) {
        const entityId = this.getEntityIdFromPath([modelPath])[0];
        assert(entityId);
        return {
          namesRecord: EntityManager.getNamesFromId(entityId),
          modelTsPath: modelPath,
        };
      }
      if (modelPath.endsWith("frame.ts")) {
        const [, frameName] = modelPath.match(/.+\/(.+)\.frame.js$/) ?? [];
        assert(frameName);
        return {
          namesRecord: EntityManager.getNamesFromId(frameName),
          modelTsPath: modelPath,
        };
      }
      throw new Error("not reachable");
    });

    await this.actionGenerateServices(params); // 여기에 API 정보가 필요한데, 얘가 자급자족 해요
    await this.actionGenerateHttps();
  }

  getEntityIdFromPath(filePaths: AbsolutePath[]): string[] {
    return _.uniq(
      filePaths.map((p) => {
        const matched = p.match(/application\/(.+)\//);
        assert(matched && matched[1]);
        return inflection.camelize(matched[1].replace(/\-/g, "_"));
      })
    );
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
      modelTsPath: string;
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

  private async getCurrentChecksums(): Promise<PathAndChecksum[]> {
    const filePaths = (
      await Promise.all(
        Object.entries(this.checksumPatternGroupsInAbsolutePath()).map(
          async ([_fileType, pattern]) => {
            return globAsync(pattern) as Promise<AbsolutePath[]>;
          }
        )
      )
    )
      .flat()
      .sort();

    const fileChecksums = await Promise.all(
      filePaths.map(async (filePath) => {
        return {
          path: filePath,
          checksum: await this.getChecksumOfFile(filePath),
        };
      })
    );

    return fileChecksums;
  }

  async getPreviousChecksums(): Promise<PathAndChecksum[]> {
    if (!(await exists(this.checksumsPath))) {
      return [];
    }

    const previousChecksums = JSON.parse(
      await readFile(this.checksumsPath, "utf-8")
    ).map((r: { path: ProjectRelativePath; checksum: string }) => ({
      path: path.join(Sonamu.apiRootPath, r.path), // 체크섬 파일에 저장할 때에는 상대 경로로 저장해요.
      checksum: r.checksum,
    })) as PathAndChecksum[];
    return previousChecksums;
  }

  private async saveChecksums(checksums: PathAndChecksum[]): Promise<void> {
    await writeFile(
      this.checksumsPath,
      JSON.stringify(
        checksums.map((r) => ({
          path: toProjectRelativePath(r.path), // 체크섬 파일에서 꺼내올 때에는 절대 경로로 꺼내와요.
          checksum: r.checksum,
        })),
        null,
        2
      ),
      "utf-8"
    );
    console.log("checksum saved", this.checksumsPath);
  }

  async getChecksumOfFile(filePath: PathLike): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const hash = crypto.createHash("sha1");
      const input = createReadStream(filePath);
      input.on("error", reject);
      input.on("data", function (chunk: any) {
        hash.update(chunk);
      });
      input.on("close", function () {
        resolve(hash.digest("hex"));
      });
    });
  }

  async autoloadApis() {
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

  async autoloadModels() {
    const modelPathsPattern = path.join(
      Sonamu.apiRootPath,
      "src/application/**/*.{model,frame}.ts"
    );
    const modelPaths = await globAsync(modelPathsPattern);

    let count = 0;
    for (const filePath of modelPaths) {
      const importedMembers = await importFresh<
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

  async autoloadTypes(): Promise<{ [typeName: string]: z.ZodObject<any> }> {
    const typePathsPatterns = [
      path.join(Sonamu.apiRootPath, "/src/application/**/*.types.ts"),
      path.join(Sonamu.apiRootPath, "/src/application/**/*.generated.ts"),
    ];
    const typePaths = (
      await Promise.all(typePathsPatterns.map(globAsync))
    ).flat();

    let count = 0;
    for (const filePath of typePaths) {
      const importedMembers = await importFresh<z.ZodObject<any>>(filePath);
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
    const { target, path: genPath } = getTemplate(templateKey).getTargetAndPath(
      EntityManager.getNamesFromId(entityId),
      enumId
    );

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
        const tpl = getTemplate(key);
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
}
