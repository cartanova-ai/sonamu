import path, { dirname } from "node:path";

import { formatCode } from "../utils/formatter";
import { syncerFileExists, syncerFilesystem } from "./filesystem-dependencies";

/**
 * Syncer 파일시스템 경계를 통해 파일을 복사하고 클라이언트용 import 경로를 변환합니다.
 */
export async function copyFileWithReplaceCoreToShared(
  fromPath: string,
  toPath: string,
  syncHeader?: string,
): Promise<boolean> {
  if (!(await syncerFileExists(fromPath))) {
    return false;
  }

  const oldFileContent = await syncerFilesystem.readFile(fromPath, "utf-8");
  let newFileContent = replaceCoreImport(oldFileContent, toPath);

  if (syncHeader) {
    const generatedBlockRegex = /\/\*\*\r?\n \* @generated\r?\n[\s\S]*?\*\/\r?\n(\r?\n)*/;
    newFileContent = generatedBlockRegex.test(newFileContent)
      ? newFileContent.replace(generatedBlockRegex, `${syncHeader}\n\n`)
      : `${syncHeader}\n\n${newFileContent}`;
  }

  if (toPath.endsWith(".ts") || toPath.endsWith(".tsx")) {
    newFileContent = await formatCode(newFileContent, toPath);
  }

  await syncerFilesystem.writeFile(toPath, newFileContent);
  return true;
}

function replaceCoreImport(source: string, toPath: string): string {
  const srcMatch = toPath.match(/^(.+\/src)\//);
  if (!srcMatch) {
    return source;
  }

  const servicesDir = path.join(srcMatch[1], "services");
  const relativePath = path.relative(dirname(toPath), servicesDir);
  const sharedPath = relativePath === "" ? "./sonamu.shared" : `${relativePath}/sonamu.shared`;
  return source.replace(/from "sonamu(\/dict)?"/g, `from "${sharedPath}"`);
}
