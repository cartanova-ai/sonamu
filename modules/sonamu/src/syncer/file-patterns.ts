import path from "path";
import { Sonamu } from "../api/sonamu";
import type { AbsolutePath, ApiRelativePath } from "../utils/path-utils";

export type FileType =
  | "model"
  | "types"
  | "functions"
  | "generated"
  | "entity"
  | "frame"
  | "config";

export type GlobPattern<T extends ApiRelativePath | AbsolutePath> = {
  [key in FileType]: T;
};

/**
 * Syncer가 관심 가지고 지켜보는 파일들입니다.
 * 이 파일들에 변경이 생기면 추가적인 작업(이하 "싱크" 또는 "싱크 액션")을 수행합니다.
 * 이 작업이라 함은 파일 복사 또는 템플릿 렌더링을 통한 code generation을 의미합니다.
 *
 * **경로 형식**: API 상대 경로 (src/로 시작)
 * **사용**: getChecksumPatternGroupInAbsolutePath()로 절대 경로 변환 후 glob 사용
 */
export const checksumPatternGroup: GlobPattern<ApiRelativePath> = {
  entity: "src/application/**/*.entity.json",
  types: "src/application/**/*.types.ts",
  generated: "src/application/sonamu.generated.ts",
  model: "src/application/**/*.model.ts",
  frame: "src/application/**/*.frame.ts",
  functions: "src/application/**/*.functions.ts",
  config: "src/sonamu.config.ts",
};

/**
 * API 상대 경로 패턴을 절대 경로 패턴으로 변환합니다.
 *
 * **목적**: Glob 패턴을 파일시스템에서 사용할 수 있는 절대 경로로 변환
 *
 * **사용처**: checksum.ts에서 실제 파일을 찾을 때
 *
 * @returns 절대 경로 기반 Glob 패턴 맵
 *
 * @example
 * // 입력: { entity: "src/application/**\/*.entity.json" }
 * // 출력: { entity: "/Users/.../api/src/application/**\/*.entity.json" }
 */
export function getChecksumPatternGroupInAbsolutePath(): GlobPattern<AbsolutePath> {
  return Object.fromEntries(
    Object.entries(checksumPatternGroup).map(([key, value]) => [
      key,
      path.join(Sonamu.apiRootPath, value), // API 상대 경로 → 절대 경로
    ]),
  ) as GlobPattern<AbsolutePath>;
}
