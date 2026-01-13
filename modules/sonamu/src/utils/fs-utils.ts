import { constants, type PathLike } from "fs";
import { access, readFile, writeFile } from "fs/promises";
import path, { dirname } from "path";

/**
 * fs/promises에는 exists가 없어요. 대신 access가 있습니다.
 * 근데 얘는 인터페이스가 쓰기 불편해요. 그래서 감싸주었습니다.
 * @param path
 * @returns
 */
export async function exists(path: PathLike): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
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
 * @param fromPath 원본 파일 경로
 * @param toPath 대상 파일 경로
 * @returns 파일을 썼으면 true, 건너뛰었으면 false
 */
export async function copyFileWithReplaceCoreToShared(
  fromPath: string,
  toPath: string,
): Promise<boolean> {
  if (!(await exists(fromPath))) {
    return false;
  }

  const oldFileContent = (await readFile(fromPath)).toString();

  const newFileContent = (() => {
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

  await writeFile(toPath, newFileContent);
  return true;
}
