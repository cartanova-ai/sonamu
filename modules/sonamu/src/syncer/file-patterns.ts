import path from "path";

import { Sonamu } from "../api/sonamu";
import { type AbsolutePath, type AppRelativePath } from "../utils/path-utils";

/**
 * Syncer가 관심 가지고 지켜보는 파일들입니다.
 * 이 파일들에 변경이 생기면 추가적인 작업(이하 "싱크" 또는 "싱크 액션")을 수행합니다.
 * 이 작업이라 함은 파일 복사 또는 템플릿 렌더링을 통한 code generation을 의미합니다.
 *
 * 경로 형식: appRoot 기준 상대 경로 (target 디렉토리로 시작, 예: "api/src/...", "web/src/...")
 * 사용: getChecksumPatternGroupInAbsolutePath()로 절대 경로 변환 후 glob 사용
 *
 * 두 가지 의미적 영역:
 * - 입력 (사용자 작성): api 디렉토리에만 위치. 사용자가 직접 편집.
 * - 출력 (sonamu 생성/복사): api 또는 target 디렉토리에 sonamu가 만들어내는 파일.
 *
 * 추적 밖 자산 (부트스트랩 phase에서 매번 보장):
 * - sonamu.shared.ts: 사용자가 커스터마이즈하는 자산. IfNotExists로 1회 생성 후 손대지 않음.
 * - entry-server.generated.tsx: 입력 의존 없는 정적 코드. 매번 overwrite generate.
 *
 * 위 둘은 sync()의 부트스트랩 phase에서 변경 검출 사이클과 무관하게 보장됩니다.
 * 추적 사이클 안에서 할 액션이 없는 자산이라 패턴 그룹에 포함되지 않습니다.
 *
 * 위치 카테고리는 api/targets/anywhere 헬퍼로 명시적으로 표현합니다.
 *
 * FileType은 이 함수의 반환 타입에서 자동 추론됩니다. 키 추가 시 별도 enum/배열을
 * 동기화할 필요 없이 여기 한 군데만 수정하면 됩니다.
 */
export function getChecksumPatternGroup() {
  // 헬퍼 함수들 만들어서 가져옵니다.
  const { api, targets, anywhere } = globBuilders();

  return {
    // Sonamu 입장에서 soruce가 되는 파일들입니다.
    // 이 친구들이 변경되면 이들로부터 액션을 수행하고 파일을 생성합니다.
    // 모노리포에서 이 source들은 api 프로젝트에 한정되므로, api에 있는 친구들만 리스팅합니다.
    config: api("src/sonamu.config.ts"),
    entity: api("src/application/**/*.entity.json"),
    frame: api("src/application/**/*.frame.ts"),
    functions: api("src/application/**/*.functions.ts"),
    model: api("src/application/**/*.model.ts"),
    types: api("src/application/**/*.types.ts"),
    workflow: api("src/application/**/*.workflow.ts"),
    i18n: api("src/i18n/**/!(sd.generated).ts"),

    // Sonamu가 출력하는 생성 파일들입니다.
    // 이 친구들도 정합성 검증 차원에서 sonamu.lock에 기록해야 하고,
    // 또한 변경시 그 사실을 syncer가 알기는 해야 합니다(비록 별다른 처리가 없는 경우도 있지만).
    //
    // 자산 본성에 따라 위치 카테고리가 다르기 때문에, 본성별로 분리해서 표기합니다.
    // - 양쪽-필요 자산: api에 정본이 만들어진 뒤 target에 복사됨 (sonamu.generated.{ts,tsx}).
    // - api 전용 자산: api에만 만들어짐 (sonamu.generated.http, queries.generated.ts).
    // - target 전용 자산: target에만 만들어짐 (services.generated.ts는 services.template의 :target 분배).
    //
    // 여기에는 Sonamu의 모든 sync 산출물이 있는 것은 아닙니다.
    // sonamu.shared.ts와 entry-server.generated.tsx와 같은
    // sync 초반 1회성 부트스트랩 파일들은 관리 안 하기 때문에 여기에 리스팅도 안 합니다.
    httpValidatorsGenerated: api("src/application/**/sonamu.validators.generated.ts"),
    generated: api("src/application/**/*.generated.{ts,tsx,sso.ts}"),
    generatedCopied: targets("src/services/**/sonamu.generated.{ts,tsx}"),
    httpGenerated: api("src/application/**/*.generated.http"),
    servicesGenerated: targets("src/services/services.generated.ts"),
    sdGenerated: anywhere("src/i18n/**/sd.generated.ts"),
    typesCopied: targets("src/services/**/*.types.ts"),
    functionsCopied: targets("src/services/**/*.functions.ts"),
    i18nCopied: targets("src/i18n/**/!(sd.generated).ts"),
  } satisfies Record<string, AppRelativePath>;
}

// Node 내장 fs.glob의 brace expansion은 단일 멤버 {x}를 풀지 않으므로, 멤버가 1개일 때는 alternation 없이 직접 결합합니다.
function braceJoin(dirs: readonly string[]) {
  return dirs.length === 1 ? dirs[0] : `{${dirs.join(",")}}`;
}

/**
 * 위치 카테고리별 글롭 빌더를 만들어 반환합니다.
 * - api(rest): api 디렉토리에 한정
 * - targets(rest): target 디렉토리들에 한정 (web, app 등)
 * - anywhere(rest): api와 target 모두
 */
function globBuilders() {
  const apiDir = Sonamu.config.api.dir;
  const targetDirs = Sonamu.config.sync.targets;

  return {
    api: (pathFromApi: string) =>
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ `${apiDir}/${pathFromApi}` as AppRelativePath,
    targets: (pathFromTarget: string) =>
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ `${braceJoin(targetDirs)}/${pathFromTarget}` as AppRelativePath,
    anywhere: (pathFromAnywhere: string) =>
      /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ `${braceJoin([apiDir, ...targetDirs])}/${pathFromAnywhere}` as AppRelativePath,
  };
}

/**
 * FileType은 getChecksumPatternGroup의 반환 객체 키에서 자동 추론됩니다.
 * 별도 배열/enum 동기화 불필요 — 패턴 그룹 함수가 진실의 단일 원천.
 */
export type FileType = keyof ReturnType<typeof getChecksumPatternGroup>;
export type GlobPattern<T extends AppRelativePath | AbsolutePath> = Record<FileType, T>;

/**
 * 빌드 산출물 디렉토리는 alternation 글롭이 의도치 않게 휘말릴 수 있으므로 안전망으로 제외.
 * Node 내장 fs.glob의 exclude 옵션과 함께 사용합니다.
 */
export const GLOB_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.turbo/**"];

/**
 * appRoot 기준 상대 경로 패턴을 절대 경로 패턴으로 변환합니다.
 *
 * @returns 절대 경로 기반 Glob 패턴 맵
 */
export function getChecksumPatternGroupInAbsolutePath(): GlobPattern<AbsolutePath> {
  const group = getChecksumPatternGroup();
  return /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ Object.fromEntries(
    Object.entries(group).map(([key, value]) => [
      key,
      path.join(Sonamu.appRootPath, value), // appRoot 상대 경로 → 절대 경로
    ]),
  ) as GlobPattern<AbsolutePath>;
}
