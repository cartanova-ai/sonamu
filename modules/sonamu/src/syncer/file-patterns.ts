import path from "path";

import { Sonamu } from "../api/sonamu";
import { type AbsolutePath, type AppRelativePath } from "../utils/path-utils";

/**
 * Syncer가 관심 가지고 지켜보는 파일들입니다.
 * 이 파일들에 변경이 생기면 추가적인 작업(이하 "싱크" 또는 "싱크 액션")을 수행합니다.
 * 이 작업이라 함은 파일 복사 또는 템플릿 렌더링을 통한 code generation을 의미합니다.
 *
 * **경로 형식**: appRoot 기준 상대 경로 (target 디렉토리로 시작, 예: "api/src/...", "web/src/...")
 * **사용**: getChecksumPatternGroupInAbsolutePath()로 절대 경로 변환 후 glob 사용
 *
 * **두 가지 의미적 영역**:
 * - **입력 (사용자 작성)**: api 디렉토리에만 위치. 사용자가 직접 편집.
 * - **출력 (sonamu 생성/복사)**: api 또는 target 디렉토리에 sonamu가 만들어내는 파일.
 *
 * 위치 카테고리는 `api`/`targets`/`anywhere` 헬퍼로 명시적으로 표현합니다.
 *
 * **FileType은 이 함수의 반환 타입에서 자동 추론됩니다.** 키 추가 시 별도 enum/배열을
 * 동기화할 필요 없이 여기 한 군데만 수정하면 됩니다.
 */
export function getChecksumPatternGroup() {
  const apiDir = Sonamu.config.api.dir;
  const targetDirs = Sonamu.config.sync.targets;

  // 위치 카테고리 헬퍼 — 패턴 본문이 단일 좌표계 `src/...`로 통일되도록 함.
  // 주의: Node 내장 fs.glob의 brace expansion은 단일 멤버 `{x}`를 풀지 않으므로,
  // 멤버가 1개일 때는 alternation 없이 직접 결합한다.
  const braceJoin = (dirs: readonly string[]) =>
    dirs.length === 1 ? dirs[0] : `{${dirs.join(",")}}`;
  const api = (rest: string) => `${apiDir}/${rest}` as AppRelativePath;
  const targets = (rest: string) => `${braceJoin(targetDirs)}/${rest}` as AppRelativePath;
  const anywhere = (rest: string) =>
    `${braceJoin([apiDir, ...targetDirs])}/${rest}` as AppRelativePath;

  return {
    // 입력 (사용자 작성) — api에 한정
    config: api("src/sonamu.config.ts"),
    entity: api("src/application/**/*.entity.json"),
    frame: api("src/application/**/*.frame.ts"),
    functions: api("src/application/**/*.functions.ts"),
    model: api("src/application/**/*.model.ts"),
    types: api("src/application/**/*.types.ts"),
    workflow: api("src/application/**/*.workflow.ts"),
    // i18n은 api 안의 ko.ts/en.ts/ja.ts (사용자 작성). target 안의 같은 파일은 i18nCopied로 별도 분류.
    i18n: api("src/i18n/**/!(sd.generated).ts"),

    // 출력 (sonamu 생성/복사) — 위치는 곳에 따라 다름
    generated: anywhere("src/**/*.generated.{ts,tsx,http,sso.ts}"),
    i18nGenerated: anywhere("src/i18n/**/sd.generated.ts"),
    // i18nCopied: api에서 target으로 복사된 ko.ts/en.ts/ja.ts (target에만 위치)
    i18nCopied: targets("src/i18n/**/!(sd.generated).ts"),
    entryServer: anywhere("src/entry-server.generated.tsx"),
  } satisfies Record<string, AppRelativePath>;
}

/**
 * FileType은 getChecksumPatternGroup의 반환 객체 키에서 자동 추론됩니다.
 * 별도 배열/enum 동기화 불필요 — 패턴 그룹 함수가 진실의 단일 원천.
 */
export type FileType = keyof ReturnType<typeof getChecksumPatternGroup>;
export type GlobPattern<T extends AppRelativePath | AbsolutePath> = Record<FileType, T>;

/**
 * 빌드 산출물 디렉토리는 alternation 글롭이 의도치 않게 휘말릴 수 있으므로 안전망으로 제외.
 * Node 내장 fs.glob의 `exclude` 옵션과 함께 사용합니다.
 */
export const GLOB_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.turbo/**"];

/**
 * appRoot 기준 상대 경로 패턴을 절대 경로 패턴으로 변환합니다.
 *
 * **사용처**: checksum.ts에서 실제 파일을 찾을 때, syncer.ts에서 파일 매치 검사 시
 *
 * @returns 절대 경로 기반 Glob 패턴 맵
 */
export function getChecksumPatternGroupInAbsolutePath(): GlobPattern<AbsolutePath> {
  const group = getChecksumPatternGroup();
  return Object.fromEntries(
    Object.entries(group).map(([key, value]) => [
      key,
      path.join(Sonamu.appRootPath, value), // appRoot 상대 경로 → 절대 경로
    ]),
  ) as GlobPattern<AbsolutePath>;
}
