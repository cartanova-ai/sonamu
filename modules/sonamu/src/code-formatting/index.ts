import { createHash } from "node:crypto";

import { cached } from "../utils/async-utils";
import { runOxfmt } from "./oxfmt";
import { runOxlint } from "./oxlint";

/**
 * 코드를 프로젝트의 oxfmt + oxlint 설정에 맞춰 포매팅한 문자열을 반환합니다.
 *
 * 캐싱도 있어요 ㅎㅎ 똑같은 입력에 대해서 캐시 커버됩니다.
 * 수명은 프로세스 죽을때까지 ㅋ
 */
export const formatCode = cached(formatCodeInternal, (code, filePath) => {
  const ext = filePath.endsWith(".tsx") ? "tsx" : filePath.endsWith(".json") ? "json" : "ts";
  return `${ext}:${createHash("sha1").update(code).digest("hex")}`;
});

/**
 * 캐시 없는 포맷함수 엔트리.
 */
async function formatCodeInternal(code: string, filePath: string): Promise<string> {
  // json은 포맷만 하면 됩니다.
  if (filePath.endsWith(".json")) {
    return runOxfmt(code, filePath);
  }

  // 린트 먼저 한 다음에 포맷으로 마무리해요.
  return runOxfmt(await runOxlint(code), filePath);
}
