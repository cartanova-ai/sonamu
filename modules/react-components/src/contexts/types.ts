/* oxlint-disable @typescript-eslint/no-explicit-any */ // 제네릭 기본값으로 any 사용

/**
 * ⚠️ 이 타입은 sonamu/types.ts와 동기화되어야 함
 *
 * 프로젝트별 도메인 필드를 추가하려면 `SonamuFileExtend`를 확장합니다.
 * (`declare module "@sonamu-kit/react-components"`)
 */
export interface SonamuFileExtend {}

export type SonamuFileBase = {
  name: string;
  url: string;
  mime_type: string;
  size: number;
};

export interface SonamuFile extends SonamuFileBase, SonamuFileExtend {}

/**
 * ⚠️ 이 타입은 sonamu/types.ts와 동기화되어야 함
 *
 * 프로젝트별 업로드 파라미터를 추가하려면 `UploadParams`를 확장합니다.
 * (`declare module "@sonamu-kit/react-components"`)
 */
export interface UploadParams {}

// Dictionary type - 모든 i18n dictionary의 기본 타입
export type Dictionary = Record<string, string | ((...args: any[]) => string)>;

/**
 * SD 반환 타입 - 제네릭으로 키에 따라 정확한 타입 반환
 *
 * 주의: union type (string | function)을 반환하므로, 함수로 호출할 때는 타입 단언 필요
 * @example (SD("key") as unknown as (param) => string)(param)
 * (이는 TypeScript가 union type을 직접 호출할 수 없기 때문)
 */
export type SDReturnType<D extends Dictionary, K extends keyof D> = D[K] extends (
  ...args: infer P
) => string
  ? ((...args: P) => string) | string
  : string;
