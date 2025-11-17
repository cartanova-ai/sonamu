import path from "path";
import { Sonamu } from "../api/sonamu";
import { AbsolutePath, ProjectRelativePath } from "../utils/path-utils";

export type FileType =
  | "model"
  | "types"
  | "functions"
  | "generated"
  | "entity"
  | "frame";

export type GlobPattern<T extends ProjectRelativePath | AbsolutePath> = {
  [key in FileType]: T;
};

/**
 * Syncer가 관심 가지고 지켜보는 파일들입니다.
 * 이 파일들에 변경이 생기면 추가적인 작업(이하 "싱크" 또는 "싱크 액션")을 수행합니다.
 * 이 작업이라 함은 파일 복사 또는 템플릿 렌더링을 통한 code generation을 의미합니다.
 */
export const checksumPatternGroup: GlobPattern<ProjectRelativePath> = {
  entity: "src/application/**/*.entity.json",
  types: "src/application/**/*.types.ts",
  generated: "src/application/sonamu.generated.ts",
  model: "src/application/**/*.model.ts",
  frame: "src/application/**/*.frame.ts",
  functions: "src/application/**/*.functions.ts",
};

/**
 * @see checksumPatternGroup 과 같으나, 파일명 패턴을 절대 경로로 변환한 것입니다.
 * @returns 
 */
export function getChecksumPatternGroupInAbsolutePath(): GlobPattern<AbsolutePath> {
    return Object.fromEntries(
      Object.entries(checksumPatternGroup).map(([key, value]) => [
        key,
        path.join(Sonamu.apiRootPath, value),
      ])
    ) as GlobPattern<AbsolutePath>;
  }
