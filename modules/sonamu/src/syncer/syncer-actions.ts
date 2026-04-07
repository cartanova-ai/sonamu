import assert from "assert";
import { mkdir, writeFile } from "fs/promises";
import path, { dirname } from "path";

import chalk from "chalk";

import { Sonamu } from "../api/sonamu";
import { type EntityNamesRecord } from "../entity/entity-manager";
import { Naite } from "../naite/naite";
import { isTest } from "../utils/controller";
import { copyFileWithReplaceCoreToShared, exists } from "../utils/fs-utils";
import { type AbsolutePath } from "../utils/path-utils";
import { generateTemplate } from "./code-generator";

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
): Promise<string[]> {
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
 * queries.generated.ts 및 entry-server.generated.tsx 재생성합니다.
 * @returns 생성된 파일 경로 배열.
 */
export async function actionGenerateSsr(): Promise<AbsolutePath[]> {
  return (
    await Promise.all([
      generateTemplate("entry_server", {}, { overwrite: true }),
      generateTemplate("queries", {}, { overwrite: true }),
    ])
  ).flat();
}

/**
 * *.types.ts, *.functions.ts, *.generated.ts를 타겟 디렉토리에 복사합니다.
 * @param tsPaths
 * @returns 복사된 파일 경로 배열.
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
            !isTest() &&
              console.log(
                chalk.bold("Copied: ") + chalk.blue(dst.replace(`${Sonamu.appRootPath}/`, "")),
              );
            const syncHeader = [
              "/**",
              " * @generated",
              " * API에서 동기화된 파일입니다. 직접 수정하지 마세요.",
              " */",
            ].join("\n");
            await copyFileWithReplaceCoreToShared(realSrc, dst, syncHeader);
            return dst;
          }),
        ),
      ),
    )
  ).flat();
}
