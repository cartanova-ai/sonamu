/**
 * 이 monorepo에 속한 패키지들을 NPM에 퍼블리시할 때 사용하는 스크립트입니다.
 *
 * 이 스크립트가 작동하는 방식:
 *  1. publish 함수에 인자로 들어온 패키지 경로들에 대해서
 *  2. 각 패키지의 package.json 파일을 읽어서 패키지 이름과 버전을 추출하고,
 *  3. 패키지의 현재 버전이 NPM에 퍼블리시되어 있지 않다면 퍼블리시를 수행합니다.
 *
 * 이 스크립트는 딱히 인자를 받지 않지만, 필요하면 NPM_DIST_TAG 환경변수로 dist-tag를 지정할 수 있습니다.
 * CI 환경 뿐만 아니라 로컬에서도 추가적인 설정 없이 바로 실행할 수 있습니다.
 * tsx를 사용하도록 감싸놓은 pnpm publish 명령을 사용하면 됩니다.
 *
 * 스크립트는 최상위 디렉토리에서 실행할 것을 상정하여 작성되었습니다.
 * 최상위 디렉토리에서 pnpm publish를 사용하여 실행하는 것 이외의 케이스는 고려하지 않았습니다.
 *
 * NPM 퍼블리시를 위해 pnpm --filter <package-name> publish 명령을 사용합니다.
 * 따라서 실행 환경의 ~/.npmrc 파일에 npmAuthToken이 설정되어 있어야 합니다.
 */

import { exec } from "child_process";
import { readFile } from "fs/promises";
import { resolve as pathResolve } from "path";

type LocalPackageInfo = {
  name: string;
  version: string;
};

function getPublishTag(): string | undefined {
  const tag = process.env.NPM_DIST_TAG?.trim();
  return tag ? tag : undefined;
}

/**
 * 이 스크립트의 메인 함수입니다.
 * @param packagePaths 퍼블리시할 패키지들의 경로 목록입니다.
 */
async function publish(...packagePaths: string[]) {
  const packages = await resolveAllPackages(...packagePaths);
  const publishTag = getPublishTag();

  if (publishTag) {
    console.log(`NPM dist-tag: ${publishTag}`);
  }

  for (const pkg of packages) {
    if (await isPublished(pkg)) {
      console.log(`${pkg.name}@${pkg.version}: 이미 퍼블리시 되었습니다.`);
    } else {
      console.log(`${pkg.name}@${pkg.version}: 퍼블리시되지 않았습니다.`);
      await publishPackage(pkg, publishTag);
    }
  }
}

async function resolveAllPackages(...packagePaths: string[]): Promise<LocalPackageInfo[]> {
  return (await Promise.all(packagePaths.map(async (path) => await getPackageInfo(path)))).filter(
    (info): info is LocalPackageInfo => info !== undefined,
  );
}

async function getPackageInfo(packagePath: string): Promise<LocalPackageInfo | undefined> {
  const packageJson = await readFile(pathResolve(packagePath, "package.json"), "utf-8");
  const packageJsonObject = JSON.parse(packageJson);
  return {
    name: packageJsonObject.name,
    version: packageJsonObject.version,
  };
}

async function isPublished(localPackage: LocalPackageInfo): Promise<boolean> {
  const response = await fetch(`https://registry.npmjs.org/${localPackage.name}`);
  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  const allPublishedVersions = Object.keys(data.versions);

  return allPublishedVersions.includes(localPackage.version);
}

async function publishPackage(localPackage: LocalPackageInfo, publishTag?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`${localPackage.name}@${localPackage.version}: 퍼블리시 중입니다...`);

    const command = publishTag
      ? `mise exec -- pnpm --filter ${localPackage.name} publish --no-git-checks --tag ${publishTag}`
      : `mise exec -- pnpm --filter ${localPackage.name} publish --no-git-checks`;
    console.log(command);

    const child = exec(command);

    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`${localPackage.name}@${localPackage.version}: 퍼블리시 완료되었습니다.`);
        resolve();
      } else {
        console.error(`${localPackage.name}@${localPackage.version}: 퍼블리시 실패하였습니다.`);
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      console.error(
        `${localPackage.name}@${localPackage.version}: 퍼블리시 중 오류가 발생하였습니다.`,
      );
      reject(error);
    });
  });
}

// 아래 목록은 "NPM에 존재하지 않으면 퍼블리시를 진행할 패키지들의 경로" 목록입니다.
// modules 폴더 아래에 있지만 별도로 퍼블리시하지 않는 패키지도 있기에, 이렇게 수동으로 지정하도록 하였습니다.
// 패키지가 추가되거나 제거될 때는 이 목록도 수정해야 합니다.
publish(
  "./modules/ts-loader",
  "./modules/hmr-hook",
  "./modules/hmr-runner",
  "./modules/sonamu",
  "./modules/react-components",
  "./modules/create-sonamu",
  "./modules/tasks",
);
