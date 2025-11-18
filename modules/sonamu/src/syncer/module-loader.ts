import path from "path";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import { z } from "zod";
import { Sonamu } from "../api/sonamu";
import { readApisFromFile } from "./api-parser";
import { BaseFrameClass } from "../api/base-frame";
import { BaseModelClass } from "../database/base-model";
import { AbsolutePath, runtimePath } from "../utils/path-utils";
import { ApiParam, ApiParamType } from "../types/types";
import { ApiDecoratorOptions } from "../api/decorators";

export type LoadedApis = {
  typeParameters: ApiParamType.TypeParam[];
  parameters: ApiParam[];
  returnType: ApiParamType;
  modelName: string;
  methodName: string;
  path: string;
  options: ApiDecoratorOptions;
}[];

export type LoadedTypes = { [typeName: string]: z.ZodObject<any> };

export type LoadedModels = {
  [modelName: string]: BaseModelClass | BaseFrameClass;
};

/**
 * *.model.ts와 *.frame.ts 파일들에서 API 메소드를 파싱하여 로드합니다.
 * registeredApis에 API가 등록되어 있어야 하기 때문에, *.model.ts 파일들을 먼저 import해야 합니다.
 * 따라서 loadModels()를 먼저 호출해야 합니다.
 */
export async function loadApis(): Promise<LoadedApis> {
  // 얘는 특이하게도 환경에 따라 .ts나 .js를 import하는 경우가 아니고,
  // 타입이 살아있는 .ts 소스 코드만을 읽어야 합니다.
  // 이것은 dev서버(hot reload)가 아닌 production 환경에서도 동일합니다.
  // 모델들의 .ts 파일이 있어야 이를 읽어서 라우트를 등록할 수 있어요!
  const modelPathsPattern = path.join(
    Sonamu.apiRootPath,
    "src/application/**/*.{model,frame}.ts" // !! runtimePath 안 씀 주의 !!
  );
  const modelPaths = (await globAsync(modelPathsPattern)) as AbsolutePath[];

  const apis: LoadedApis = [];
  let count = 0;
  for (const filePath of modelPaths) {
    const parsedApis = await readApisFromFile(filePath);
    apis.push(...parsedApis);
    count++;
  }
  // console.log(
  //   chalk.gray(`[Loading] Loaded APIs from "*.model.ts" files: ${count} files.`)
  // );

  return apis;
}

/**
 * *.model.ts와 *.frame.ts 파일들에서 Model/Frame 클래스 인스턴스를 로드합니다.
 */
export async function loadModels(): Promise<LoadedModels> {
  const modelPathsPattern = path.join(
    Sonamu.apiRootPath,
    runtimePath("src/application/**/*.{model,frame}.ts")
  );
  const modelPaths = await globAsync(modelPathsPattern);

  const models: LoadedModels = {};
  let count = 0;
  for (const filePath of modelPaths) {
    const importedMembers = await importMembers<
      BaseModelClass | BaseFrameClass
    >(filePath);

    for (const { name, value } of importedMembers) {
      if (name.endsWith("Model") || name.endsWith("Frame")) {
        models[name] = value;
      }
    }
    count++;
  }
  // console.log(
  //   chalk.gray(
  //     `[Loading] Loaded model/frame instances from ${runtimePath("*.{model,frame}.ts")} files: ${count} files.`
  //   )
  // );

  return models;
}

/**
 * *.types.ts와 *.generated.ts 파일들에서 Zod 스키마를 로드합니다.
 */
export async function loadTypes(): Promise<LoadedTypes> {
  const typePathsPatterns = [
    path.join(Sonamu.apiRootPath, runtimePath("src/application/**/*.types.ts")),
    path.join(
      Sonamu.apiRootPath,
      runtimePath("src/application/**/*.generated.ts")
    ),
  ];
  const typePaths = (
    await Promise.all(typePathsPatterns.map(globAsync))
  ).flat();

  const types: LoadedTypes = {};
  let count = 0;
  for (const filePath of typePaths) {
    const importedMembers = await importMembers<z.ZodObject<any>>(filePath);
    for (const { name, value } of importedMembers) {
      if (value instanceof z.ZodObject) {
        types[name] = value;
      }
    }
    count++;
  }
  // console.log(
  //   chalk.gray(
  //     `[Loading] Loaded zod types from ${runtimePath("*.types.ts")} and ${runtimePath("*.generated.ts")} files: ${count} files.`
  //   )
  // );

  return types;
}
