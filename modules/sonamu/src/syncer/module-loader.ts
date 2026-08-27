import path from "path";

import { z } from "zod";

import { type BaseFrameClass } from "../api/base-frame";
import { type ExtendedApi } from "../api/decorators";
import { Sonamu } from "../api/sonamu";
import { type BaseModelClass } from "../database/base-model";
import { type WorkflowMetadata } from "../tasks/decorator";
import { globAsync } from "../utils/async-utils";
import { importMembers } from "../utils/esm-utils";
import { runtimePath } from "../utils/path-utils";
import { type AbsolutePath } from "../utils/path-utils";
import { isFunctionValue, isObjectValue } from "../utils/runtime-value";
import { readApisFromFile } from "./api-parser";

export type LoadedApis = ExtendedApi[];

export type LoadedTypes = { [typeName: string]: z.ZodType };

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
    "src/application/**/*.{model,frame}.ts", // !! runtimePath 안 씀 주의 !!
  );
  const modelPaths =
    /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (await globAsync(
      modelPathsPattern,
    )) as AbsolutePath[];

  const apis: LoadedApis = [];
  for (const filePath of modelPaths) {
    const parsedApis = await readApisFromFile(filePath);
    apis.push(...parsedApis);
  }
  // console.log(
  //   chalk.gray(`[Loading] Loaded APIs from "*.model.ts" files: ${count} files.`)
  // );

  for (const api of apis) {
    if (api.path === "") {
      // api의 경로(path)가 "텅 비어있음"인 상태입니다.
      // 이는 @api와 함께 사용해야 하는 데코레이터가 @api 없이 붙은 상황입니다.
      throw new Error(
        `API ${api.modelName}.${api.methodName} has no path. Please attach @api decorator to the method.`,
      );
    }
  }

  return apis;
}

/**
 * *.model.ts와 *.frame.ts 파일들에서 Model/Frame 클래스 인스턴스를 로드합니다.
 */
export async function loadModels(): Promise<LoadedModels> {
  const modelPathsPattern = path.join(
    Sonamu.apiRootPath,
    runtimePath("src/application/**/*.{model,frame}.ts"),
  );
  const modelPaths = await globAsync(modelPathsPattern);

  const models: LoadedModels = {};
  for (const filePath of modelPaths) {
    const importedMembers = await importMembers<BaseModelClass | BaseFrameClass>(filePath);

    for (const { name, value } of importedMembers) {
      if (name.endsWith("Model") || name.endsWith("Frame")) {
        models[name] = value;
      }
    }
  }

  return models;
}

/**
 * *.types.ts와 *.generated.ts 파일들에서 Zod 스키마를 로드합니다.
 */
export async function loadTypes(): Promise<LoadedTypes> {
  const typePathsPatterns = [
    path.join(Sonamu.apiRootPath, runtimePath("src/application/**/*.types.ts")),
    path.join(Sonamu.apiRootPath, runtimePath("src/application/**/*.generated.ts")),
  ];
  const typePaths = (
    await Promise.all(typePathsPatterns.map((pattern) => globAsync(pattern)))
  ).flat();

  const types: LoadedTypes = {};
  for (const filePath of typePaths) {
    const importedMembers = await importMembers<z.ZodType>(filePath);
    for (const { name, value } of importedMembers) {
      if (value instanceof z.ZodType) {
        types[name] = value;
      }
    }
  }

  return types;
}

/**
 * *.workflow.ts 파일들에서 Workflow 메타데이터를 로드합니다.
 */
export async function loadWorkflows() {
  const workflowPathsPattern = path.join(
    Sonamu.apiRootPath,
    runtimePath("src/application/**/*.workflow.ts"),
  );
  const workflowPaths = await globAsync(workflowPathsPattern);
  const workflows: Map<string, WorkflowMetadata[]> = new Map();
  for (const filePath of workflowPaths) {
    const importedMembers = await importMembers(filePath);
    workflows.set(
      filePath,
      importedMembers
        .filter(({ value }) => {
          return (
            isObjectValue(value) &&
            value !== null &&
            "type" in value &&
            value.type === "workflow" &&
            "fn" in value &&
            isFunctionValue(value.fn)
          );
        })
        .map(({ value }) => {
          return /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ value as WorkflowMetadata;
        }),
    );
  }

  return workflows;
}
