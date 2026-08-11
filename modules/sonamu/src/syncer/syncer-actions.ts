import assert from "assert";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path, { dirname } from "path";

import chalk from "chalk";

import { Sonamu } from "../api/sonamu";
import { type EntityNamesRecord } from "../entity/entity-manager";
import { AlreadyProcessedException } from "../exceptions/so-exceptions";
import { Naite } from "../naite/naite";
import { isTest } from "../utils/controller";
import { formatCode } from "../utils/formatter";
import { copyFileWithReplaceCoreToShared, exists } from "../utils/fs-utils";
import { type AbsolutePath } from "../utils/path-utils";
import { generateTemplate } from "./code-generator";
import { trackWritten } from "./file-tracking";

// web/.sonamu.env 에 현재 설정값 저장
export async function actionSyncConfig() {
  const { host, port } = Sonamu.config.server.listen ?? {};
  const content = `API_HOST=${host ?? "localhost"}\nAPI_PORT=${port ?? 3000}`;

  Naite.t("actionSyncConfig", { content });
  await Promise.all([
    ...Sonamu.config.sync.targets.map(async (target) => {
      await writeFile(path.join(Sonamu.appRootPath, target, ".sonamu.env"), content);
    }),
    generateTemplate("generated_sso", {}, { overwrite: true }),
  ]);
}

/**
 * services.generated.ts를 생성합니다.
 * @param paramsArray
 * @returns 생성된 파일 경로 배열.
 */
export async function actionGenerateServices(
  paramsArray: {
    namesRecord: EntityNamesRecord;
  }[],
): Promise<AbsolutePath[]> {
  Naite.t("actionGenerateServices", paramsArray);

  // services.generated.ts 통합 파일 생성
  const servicesFile = await generateTemplate(
    "services",
    {},
    {
      overwrite: true,
    },
  );

  return [...servicesFile];
}

/**
 * Entity에 딸린 초기 types.ts를 만들어줍니다.
 * @param entityId
 */
export async function actionGenerateInitialTypes(entityId: string): Promise<AbsolutePath[]> {
  return generateTemplate("init_types", { entityId });
}

/**
 * sonamu.generated.ts와 sonamu.generated.sso.ts를 생성합니다.
 * @returns 생성된 파일 경로 배열.
 */
export async function actionGenerateSchemas(): Promise<AbsolutePath[]> {
  return (
    await Promise.all([
      generateTemplate("generated_sso", {}, { overwrite: true }),
      generateTemplate("generated", {}, { overwrite: true }),
    ])
  ).flat();
}

/**
 * sonamu.generated.http를 생성합니다.
 * @returns 생성된 파일 경로.
 */
export async function actionGenerateHttps(): Promise<AbsolutePath> {
  const [res] = await generateTemplate(
    "generated_http",
    { entityId: "dummy" },
    { overwrite: true },
  );
  assert(res);
  return res;
}

/**
 * 최종 REST caster를 담는 API 전용 validator registry를 재생성합니다.
 */
export async function actionGenerateHttpValidators(): Promise<AbsolutePath> {
  const registryPath = path.join(
    Sonamu.apiRootPath,
    "src/application/sonamu.validators.generated.ts",
  ) as AbsolutePath;
  const policy = Sonamu.config.validation?.zodCompiler;
  const isAot = typeof policy === "object" && policy !== null && policy.api === "aot";
  if (!isAot) {
    // opt-out/JIT 전환 뒤 AOT compile import가 애플리케이션에 남지 않도록 산출물도 함께 정리합니다.
    if (await exists(registryPath)) {
      await unlink(registryPath);
    }
    return registryPath;
  }

  const [generatedPath] = await generateTemplate("http_validators", {}, { overwrite: true });
  assert(generatedPath);
  return generatedPath;
}

/**
 * queries.generated.ts 재생성합니다.
 * @returns 생성된 파일 경로 배열.
 */
export async function actionGenerateSsrQueries(): Promise<AbsolutePath[]> {
  return generateTemplate("queries", {}, { overwrite: true });
}

/**
 * entry-server.generated.tsx를 생성합니다.
 * 다른 액션들과 달리, 이미 파일이 있으면 그냥 놔둡니다. 그래서 함수 이름 끝에 써놨어요 ㅎ
 * 입력 의존 없는 정적 코드라 매번 overwrite는 mtime만 갱신하는 의미 없는 동작.
 * 템플릿 자체가 변경된 경우(Sonamu 업그레이드)에는 사용자가 파일을 삭제한 뒤 sync로 재생성.
 * @returns 생성된 파일 경로 배열 (이미 있으면 빈 배열).
 */
export async function actionGenerateSsrEntryServerIfNotExists(): Promise<AbsolutePath[]> {
  try {
    return await generateTemplate("entry_server", {}, { overwrite: false });
  } catch (e) {
    // generateTemplate은 overwrite: false에서 파일이 이미 있으면 예외를 던집니다.
    // IfNotExists 의미상 "그냥 놔둔다"가 정상이므로 빈 배열로 변환합니다.
    if (e instanceof AlreadyProcessedException) {
      return [];
    }
    throw e;
  }
}

/**
 * 주어진 .ts 파일들(api에 있다고 가정)을 모든 타겟 디렉토리의 services에 갖다 둡니다.
 * 이때 내부의 sonamu import는 sonamu.shared.ts import로 치환되고,
 * 경로의 /application/은 /services/로 치환됩니다.
 *
 * @param tsPaths 복사할 파일들의 절대 경로
 * @returns 각 타겟에 복사된 파일들의 절대 경로 배열 (flat).
 */
export async function actionSyncFilesToTargets(tsPaths: AbsolutePath[]): Promise<string[]> {
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
            const syncHeader = [
              "/**",
              " * @generated",
              " * API에서 동기화된 파일입니다. 직접 수정하지 마세요.",
              " */",
            ].join("\n");
            await copyFileWithReplaceCoreToShared(realSrc, dst, syncHeader);
            await trackWritten(dst as AbsolutePath);
            !isTest() &&
              console.log(
                chalk.bold("Copied: ") + chalk.blue(dst.replace(`${Sonamu.appRootPath}/`, "")),
              );
            return dst;
          }),
        ),
      ),
    )
  ).flat();
}

/**
 * shared 템플릿으로부터 sonamu.shared.ts 파일을 만들어서 모든 타겟 디렉토리에 갖다 둡니다.
 * 파일을 만드는 과정에서 여러 치환 가공이 일어납니다.
 *
 * 다른 액션들과 달리, 이미 파일이 있으면 그냥 놔둡니다. 그래서 함수 이름 끝에 써놨어요 ㅎ
 */
export async function actionCopySharedToTargetsIfNotExists(): Promise<void> {
  const { targets } = Sonamu.config.sync;

  // plural.ts 내용을 읽어서 shared 파일에 삽입합니다.
  const dictUtilsPath = path.join(
    import.meta.dirname.replace("/dist/", "/src/"),
    "../dict/utils.ts",
  );
  const dictUtilsCode = (await exists(dictUtilsPath)) ? await readFile(dictUtilsPath, "utf-8") : "";

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

    await writeFile(destPath, await formatCode(convertedText, destPath));
    !isTest() &&
      console.log(chalk.bold("Copied: ") + chalk.blue(path.relative(Sonamu.appRootPath, destPath)));
  }
}

/**
 * Sonamu Dictionary(SD)를 모든 타겟(api + web/app 등)에 동기화합니다.
 *
 * 각 타겟에 대해:
 * - target이 api가 아니면 사용자 작성 locale 파일(ko.ts/en.ts/...)을 api → target으로 복사
 * - sd 템플릿을 렌더링해서 sd.generated.ts 생성 (overwrite)
 *
 * 한 타겟에서 실패해도 다른 타겟은 계속 진행합니다.
 */
export async function actionSyncSonamuDictionary(): Promise<void> {
  const { targets } = Sonamu.config.sync;
  const i18nConfig = Sonamu.config.i18n;

  const targetList = ["api", ...targets] as ("api" | "web" | "app")[];

  const apiI18nDir = path.join(Sonamu.appRootPath, Sonamu.config.api.dir, "src/i18n");

  for (const target of targetList) {
    try {
      // web/app의 경우 locale 파일들을 api에서 복사
      if (target !== "api") {
        await syncLocaleFiles(target, apiI18nDir, i18nConfig.supportedLocales);
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
async function syncLocaleFiles(
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
    await trackWritten(targetFile as AbsolutePath);
    !isTest() &&
      console.log(chalk.bold("Copied: ") + chalk.cyan(`${target}/src/i18n/${locale}.ts`));
  }
}
