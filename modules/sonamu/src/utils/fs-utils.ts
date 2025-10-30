import { PathLike, constants } from "fs";
import { access } from "fs/promises";

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
