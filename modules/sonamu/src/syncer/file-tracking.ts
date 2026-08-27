import { type AbsolutePath } from "../utils/path-utils";
import { syncerFilesystem } from "./filesystem-dependencies";

export const fileWrittenAt = new Map<AbsolutePath, number>();

/**
 * 우리가 디스크에 write한 path를 등록합니다. write 직후 호출하세요.
 * 디스크에서 mtime을 직접 읽어 정확한 값으로 등록합니다.
 */
export async function trackWritten(filePath: AbsolutePath): Promise<void> {
  const fileStat = await syncerFilesystem.stat(filePath);
  fileWrittenAt.set(filePath, fileStat.mtimeMs);
}

/**
 * 주어진 path가 가장 최근 우리 write 이후로 외부에서 수정된 적 없는지 확인합니다.
 * true면 "내가 쓴 그대로 남아있음", false면 "외부에서 수정됐거나 우리가 쓴 적 없음".
 */
export async function isLastChangedByMe(filePath: AbsolutePath): Promise<boolean> {
  const registered = fileWrittenAt.get(filePath);
  if (registered === undefined) {
    return false;
  }
  const fileStat = await syncerFilesystem.stat(filePath);
  return fileStat.mtimeMs <= registered;
}
