import { constants } from "fs";
import { type PathLike } from "fs";
import { access, readFile, stat, writeFile } from "fs/promises";
import path, { dirname } from "path";

import { formatCode } from "./formatter";

/**
 * fs/promises에는 exists가 없어요. 대신 access가 있습니다.
 * 근데 얘는 인터페이스가 쓰기 불편해요. 그래서 감싸주었습니다.
 * @param targetPath
 * @returns
 */
export async function exists(targetPath: PathLike): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// 디렉토리가 아니라 파일만 존재하는지 확인합니다.
export async function fileExists(targetPath: PathLike): Promise<boolean> {
  try {
    const stats = await stat(targetPath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * 파일을 복사하면서 `from "sonamu"` import를 sonamu.shared.ts 경로로 치환합니다.
 *
 * web이나 app 등에는 sonamu 패키지가 없으므로, 함께 복사되는 sonamu.shared.ts에서 가져오도록 변환합니다.
 * 대상 파일의 위치에 따라 상대 경로가 달라집니다:
 * - services/sonamu.generated.ts → ./sonamu.shared
 * - services/user/user.types.ts → ../sonamu.shared
 * - i18n/ko.ts → ../services/sonamu.shared
 *
 * ts/tsx 파일은 쓰기 전에 oxfmt/oxlint 한번 돌려줍니다!
 *
 * @param fromPath 원본 파일 경로
 * @param toPath 대상 파일 경로
 * @param syncHeader 동기화 시 파일 최상단에 삽입할 주석 블록. 기존 @generated 블록이 있으면 교체하고, 없으면 최상단에 추가합니다.
 * @returns 파일을 썼으면 true, 건너뛰었으면 false
 */
export async function copyFileWithReplaceCoreToShared(
  fromPath: string,
  toPath: string,
  syncHeader?: string,
): Promise<boolean> {
  if (!(await exists(fromPath))) {
    return false;
  }

  const oldFileContent = (await readFile(fromPath)).toString();

  let newFileContent = (() => {
    // sonamu.shared.ts는 항상 {base}/src/services/sonamu.shared.ts에 위치합니다.
    // toPath에서 /src/를 찾아 services 디렉토리 경로를 계산합니다.
    const srcMatch = toPath.match(/^(.+\/src)\//);
    if (!srcMatch) {
      // /src/가 없으면 변환 없이 그대로 반환
      return oldFileContent;
    }

    const servicesDir = path.join(srcMatch[1], "services");
    const fileDir = dirname(toPath);
    const relativePath = path.relative(fileDir, servicesDir);
    const sharedPath = relativePath === "" ? "./sonamu.shared" : `${relativePath}/sonamu.shared`;

    return oldFileContent.replace(/from "sonamu(\/dict)?"/g, `from "${sharedPath}"`);
  })();

  // syncHeader가 제공된 경우 @generated 블록을 교체하거나 최상단에 추가합니다.
  // `*/` 직후에는 항상 빈 줄 한 개를 보장하여 oxfmt가 주석을 import의 leading comment로 오인해 정렬 시 끌려가는 문제를 방지합니다.
  if (syncHeader) {
    // 기존 @generated 블록 + 뒤이어 오는 빈 줄들(있으면 포함)을 한꺼번에 매칭하여 교체 시 빈 줄이 누적되지 않게 합니다.
    // 한 줄짜리(/** @generated */)는 매칭하지 않으므로 수동으로 축약하지 마세요.
    const generatedBlockRegex = /\/\*\*\r?\n \* @generated\r?\n[\s\S]*?\*\/\r?\n(\r?\n)*/;
    if (generatedBlockRegex.test(newFileContent)) {
      newFileContent = newFileContent.replace(generatedBlockRegex, `${syncHeader}\n\n`);
    } else {
      newFileContent = `${syncHeader}\n\n${newFileContent}`;
    }
  }

  // .ts/.tsx 산출물은 쓰기 전에 포맷도 해줘요 ㅎㅎ
  if (toPath.endsWith(".ts") || toPath.endsWith(".tsx")) {
    newFileContent = await formatCode(newFileContent, toPath);
  }

  await writeFile(toPath, newFileContent);
  return true;
}
