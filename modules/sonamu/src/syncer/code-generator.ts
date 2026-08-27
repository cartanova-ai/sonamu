import path from "path";

import chalk from "chalk";
import { unique } from "radashi";

import { Sonamu } from "../api/sonamu";
import { SD } from "../dict/sd";
import { EntityManager } from "../entity/entity-manager";
import { AlreadyProcessedException } from "../exceptions/so-exceptions";
import { Naite } from "../naite/naite";
import { type RenderedTemplate } from "../template/template";
import { TemplateManager } from "../template/template-manager";
import { BUILT_IN_TYPES } from "../template/zod-converter";
import {
  type GenerateOptions,
  type PathAndCode,
  type TemplateKey,
  type TemplateOptions,
} from "../types/types";
import { everyAsync, filterAsync } from "../utils/async-utils";
import { isTest } from "../utils/controller";
import { formatCode } from "../utils/formatter";
import { wrapIf } from "../utils/lodash-able";
import { type AbsolutePath } from "../utils/path-utils";
import { trackWritten } from "./file-tracking";
import { syncerFileExists, syncerFilesystem } from "./filesystem-dependencies";

/**
 * 템플릿을 렌더링하고 파일로 생성합니다.
 * overwrite 옵션이 false인 경우, 이미 존재하는 파일은 건너뜁니다.
 * @param key - 템플릿 키 (예: "entity", "model", "service" 등)
 * @param templateOptions - 템플릿 렌더링에 필요한 옵션
 * @param _generateOptions - 생성 옵션 (overwrite 여부)
 * @returns 생성된 파일 경로 배열
 */
export async function generateTemplate<T extends TemplateKey>(
  key: T,
  templateOptions: TemplateOptions[T],
  _generateOptions?: GenerateOptions,
): Promise<AbsolutePath[]> {
  const generateOptions = {
    overwrite: false,
    ..._generateOptions,
  };
  Naite.t("generateTemplate", { key, templateOptions, generateOptions });

  // 키 children
  const keys: TemplateKey[] = [key];

  // 템플릿 렌더
  const pathAndCodes = (
    await Promise.all(
      keys.map(async (templateKey) => {
        return await renderTemplate(templateKey, templateOptions);
      }),
    )
  ).flat();

  const filteredPathAndCodes: PathAndCode[] = await (async () => {
    if (generateOptions.overwrite) {
      return pathAndCodes;
    } else {
      return await filterAsync(pathAndCodes, async (pathAndCode) => {
        const { targets } = Sonamu.config.sync;
        const filePath = `${Sonamu.appRootPath}/${pathAndCode.path}`;
        const dstFilePaths = targets.map((target) => filePath.replace("/:target/", `/${target}/`));
        return await everyAsync(
          dstFilePaths,
          async (dstPath) => !(await syncerFileExists(dstPath)),
        );
      });
    }
  })();

  if (filteredPathAndCodes.length === 0) {
    throw new AlreadyProcessedException(SD("sonamu.error.allFilesExist"));
  }

  return (
    await Promise.all(
      filteredPathAndCodes.map((pathAndCode) => writeCodeToPathEachTarget(pathAndCode)),
    )
  ).flat();
}

/**
 * 템플릿을 렌더링하여 PathAndCode 객체를 반환합니다.
 * 파일로 쓰지 않고 메모리상에서만 렌더링합니다.
 * @param key - 템플릿 키
 * @param options - 템플릿 렌더링 옵션
 * @returns 경로와 코드 쌍의 배열
 */
export async function renderTemplate<T extends keyof TemplateOptions>(
  key: T,
  options: TemplateOptions[T],
): Promise<PathAndCode[]> {
  Naite.t("renderTemplate", { key, options });

  const template = TemplateManager.get(key);

  const rendered = await template.render(options);
  const resolved = await resolveRenderedTemplate(key, rendered);

  let preTemplateResolved: PathAndCode[] = [];
  if (rendered.preTemplates) {
    preTemplateResolved = (
      await Promise.all(
        rendered.preTemplates.map(({ key: preTemplateKey, options: preTemplateOptions }) => {
          return renderTemplate(preTemplateKey, preTemplateOptions);
        }),
      )
    ).flat();
  }

  return [resolved, ...preTemplateResolved];
}

async function resolveRenderedTemplate(
  key: TemplateKey,
  result: RenderedTemplate,
): Promise<PathAndCode> {
  Naite.t(`resolveRenderedTemplate${key}`, { key, result });

  const { target, path: filePath, body, importKeys, customHeaders } = result;

  // import 할 대상의 대상 path 추출
  const builtInSchemaNames = Object.values(BUILT_IN_TYPES).map(
    (info) =>
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ info.schemaName as string,
  );
  const importDefs = importKeys
    // 내장 타입 스키마는 이미 sonamu에서 import되므로 제외
    .filter((importKey) => !builtInSchemaNames.includes(importKey))
    .reduce(
      (r, importKey) => {
        let modulePath = importKey;
        try {
          modulePath = EntityManager.getModulePath(importKey);
        } catch (error) {
          throw new Error(
            `[resolveRenderedTemplate:${key}] ${importKey} 모듈 경로 찾기 실패: ${error}`,
            { cause: error },
          );
        }
        let importPath = modulePath;
        if (modulePath.includes("/") || modulePath.includes(".")) {
          importPath = wrapIf(path.relative(path.dirname(filePath), modulePath), (p) => [
            !p.startsWith("."),
            `./${p}`,
          ]);
        }

        // 같은 파일에서 import 하는 경우 keys 로 나열 처리
        const existsOne = r.find((importDef) => importDef.from === importPath);
        if (existsOne) {
          existsOne.keys = unique(existsOne.keys.concat(importKey));
        } else {
          r.push({
            keys: [importKey],
            from: importPath,
          });
        }
        return r;
      },
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ [] as {
        keys: string[];
        from: string;
      }[],
    )
    // 셀프 참조 방지
    .filter((importDef) => !filePath.endsWith(`${importDef.from.replace("./", "")}.ts`));

  // 커스텀 헤더 포함하여 헤더 생성
  const header = [
    ...(customHeaders ?? []),
    ...importDefs.map(
      (importDef) => `import { ${importDef.keys.join(", ")} } from '${importDef.from}'`,
    ),
  ].join("\n");

  const formatted = await (async () => {
    if (key === "generated_http") {
      return [header, body].join("\n\n");
    } else {
      Naite.t("resolveRenderedTemplate:beforeFormat", { key, header, body });
      const formattedCode = await formatCode(
        [header, body].join("\n\n"),
        `${Sonamu.appRootPath}/${filePath}`,
      );
      Naite.t(`resolveRenderedTemplate:formatted:${key}`, formattedCode);
      return formattedCode;
    }
  })();

  return {
    path: `${target}/${filePath}`,
    code: formatted,
  };
}

async function writeCodeToPathEachTarget(pathAndCode: PathAndCode): Promise<AbsolutePath[]> {
  const { targets } = Sonamu.config.sync;
  const { appRootPath } = Sonamu;
  const filePath =
    /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ `${Sonamu.appRootPath}/${pathAndCode.path}` as AbsolutePath;

  const dstFilePaths = unique(
    /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ targets.map(
      (target) => filePath.replace("/:target/", `/${target}/`),
    ) as AbsolutePath[],
  );
  return await Promise.all(
    dstFilePaths.map(async (dstFilePath) => {
      const dir = path.dirname(dstFilePath);
      if (!(await syncerFileExists(dir))) {
        await syncerFilesystem.mkdir(dir, { recursive: true });
      }
      await syncerFilesystem.writeFile(dstFilePath, pathAndCode.code);
      // 방금 우리가 쓴 path를 등록 → dev watcher의 후속 change 이벤트가
      // 외부 변경으로 오인되지 않도록 거름 가드 자료 제공.
      await trackWritten(dstFilePath);
      !isTest() &&
        console.log(
          chalk.bold("Generated: ") + chalk.blue(`${dstFilePath.replace(`${appRootPath}/`, "")}`),
        );
      return dstFilePath;
    }),
  );
}
