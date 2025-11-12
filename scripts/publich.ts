/**
 * 주어진 경로 아래에 존재하는 패키지들에 대해 필요시 npm publish를 실행합니다.
 */

import { resolve as pathResolve } from "path";
import { readdir, readFile, stat } from "fs/promises";
import { exec } from "child_process";

type LocalPackageInfo = {
  name: string;
  version: string;
};

async function publish(...packagePaths: string[]) {
  const packages = await resolveAllPackages(...packagePaths);

  for (const pkg of packages) {
    if (await isPublished(pkg)) {
      console.log(`${pkg.name}@${pkg.version}: 이미 퍼블리시 되었습니다.`);
    } else {
      console.log(`${pkg.name}@${pkg.version}: 퍼블리시되지 않았습니다.`);
      await publishPackage(pkg);
    }
  }
}

async function resolveAllPackages(
  ...packagePaths: string[]
): Promise<LocalPackageInfo[]> {
  return (
    await Promise.all(
      packagePaths.map(async (path) => await getPackageInfo(path))
    )
  ).filter((info): info is LocalPackageInfo => info !== undefined);
}

async function getPackageInfo(
  packagePath: string
): Promise<LocalPackageInfo | undefined> {
  const packageJson = await readFile(
    pathResolve(packagePath, "package.json"),
    "utf-8"
  );
  const packageJsonObject = JSON.parse(packageJson);
  return {
    name: packageJsonObject.name,
    version: packageJsonObject.version,
  };
}

async function isPublished(localPackage: LocalPackageInfo): Promise<boolean> {
  const response = await fetch(
    `https://registry.npmjs.org/${localPackage.name}`
  );
  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  const allPublishedVersions = Object.keys(data.versions);

  return allPublishedVersions.includes(localPackage.version);
}

async function publishPackage(localPackage: LocalPackageInfo): Promise<void> {    
  return new Promise((resolve, reject) => {
    console.log(
      `${localPackage.name}@${localPackage.version}: 퍼블리시 중입니다...`
    );

    const command = `yarn workspace ${localPackage.name} npm publish`;
    console.log(command);

    const child = exec(command);

    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    child.on("close", (code) => {
      if (code === 0) {
        console.log(
          `${localPackage.name}@${localPackage.version}: 퍼블리시 완료되었습니다.`
        );
        resolve();
      } else {
        console.error(
          `${localPackage.name}@${localPackage.version}: 퍼블리시 실패하였습니다.`
        );
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on("error", (error) => {
      console.error(
        `${localPackage.name}@${localPackage.version}: 퍼블리시 중 오류가 발생하였습니다.`
      );
      reject(error);
    });
  });
}

publish(
  "./modules/sonamu",
  "./modules/ui",
  "./modules/react-sui",
  "./modules/create-sonamu"
);
