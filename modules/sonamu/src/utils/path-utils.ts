import path from 'path';
import { Sonamu } from '../api/sonamu.js';
import { isHMREnabled } from './esm-utils.js';

/**
 * API 패키지 내부 상대 경로 (src/ 또는 dist/로 시작)
 *
 * **사용 위치**: API 패키지 내부 파일 참조
 * **예시**:
 * - `"src/application/user/user.model.ts"`
 * - `"dist/application/user/user.model.js"`
 *
 * **기준점**: `Sonamu.apiRootPath` (일반적으로 프로젝트의 `/api` 디렉토리)
 */
export type ApiRelativePath = `${'src' | 'dist'}/${string}`;

/**
 * 앱 루트 기준 상대 경로 (api/, web/ 등 타겟 디렉토리로 시작)
 *
 * **사용 위치**: 다른 타겟(api, web 등)의 파일 참조
 * **예시**:
 * - `"api/src/application/user/user.model.ts"`
 * - `"web/src/pages/admin/users/index.tsx"`
 * - `"app/dist/index.js"`
 *
 * **기준점**: `Sonamu.appRootPath` (일반적으로 모노레포 루트)
 */
export type AppRelativePath = `${string}/${'src' | 'dist'}/${string}`;

/**
 * 시스템 절대 경로 (루트 / 부터 시작)
 *
 * **사용 위치**: 파일시스템 직접 접근, glob 패턴
 * **예시**: `"/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts"`
 *
 * **중요**:
 * - import 시에는 로더가 알아서 src/dist 변환해주므로 어느 경로든 가능
 * - fs 직접 접근 시에는 실제 존재하는 경로를 사용해야 함
 *   - Dev: src/*.ts 경로 사용
 *   - Prod: dist/*.js 경로 사용
 */
export type AbsolutePath = `/${string}`;

/**
 * @deprecated ApiRelativePath를 사용하세요
 */
export type ProjectRelativePath = ApiRelativePath;

/**
 * 동적 import를 위한 모듈 경로를 환경에 맞게 해석합니다.
 *
 * **목적**: 동적 import(await import(...))에 사용할 절대 경로 생성
 *
 * **환경별 동작**:
 * - Dev 모드 (yarn dev:serve): `src/*.ts` 경로 반환
 *   - TS 로더가 자동으로 트랜스파일
 *   - 파일시스템에 실제 src/*.ts 파일이 존재해야 함
 * - Prod 모드 (yarn build && yarn serve): `dist/*.js` 경로 반환
 *   - 사전 빌드된 JS 파일 사용
 *   - 파일시스템에 실제 dist/*.js 파일이 존재해야 함
 *
 * **로더의 역할**: 로더는 dist 경로를 받아도 알아서 src를 찾아주지만,
 * 파일시스템 직접 접근(glob, exists 등)은 실제 파일이 있어야 하므로
 * 환경에 맞는 경로를 명시적으로 사용해야 합니다.
 *
 * @param relativePath - API 루트 기준 상대 경로 (ApiRelativePath)
 * @returns 시스템 절대 경로 (AbsolutePath)
 *
 * @example
 * // Dev 환경
 * resolveModulePath('src/application/user/user.model.ts')
 * // → /Users/potados/Projects/sonamu/api/src/application/user/user.model.ts
 *
 * // Prod 환경
 * resolveModulePath('src/application/user/user.model.ts')
 * // → /Users/potados/Projects/sonamu/api/dist/application/user/user.model.js
 */
export function resolveModulePath(relativePath: string): AbsolutePath {
  const isDevMode = isHMREnabled();

  // 앞의 슬래시 제거
  const cleanPath = relativePath.startsWith('/')
    ? relativePath.slice(1)
    : relativePath;

  if (isDevMode) {
    // Dev 모드: src/*.ts
    const srcPath = cleanPath
      .replace(/^dist\//, 'src/')
      .replace(/\.js$/, '.ts');

    return path.join(Sonamu.apiRootPath, srcPath) as AbsolutePath;
  } else {
    // Prod 모드: dist/*.js
    const distPath = cleanPath
      .replace(/^src\//, 'dist/')
      .replace(/\.ts$/, '.js');

    return path.join(Sonamu.apiRootPath, distPath) as AbsolutePath;
  }
}

/**
 * Glob 패턴을 환경에 맞게 src/dist 및 확장자 변환합니다.
 *
 * **목적**: 파일시스템 탐색(glob)을 위한 패턴을 환경에 맞게 변환
 *
 * **사용처**: globAsync() 호출 전 패턴 정규화
 *
 * **환경별 동작**:
 * - Dev 모드 (auto 또는 toDev): `dist/**\/*.js` → `src/**\/*.ts`
 * - Prod 모드 (auto 또는 toProd): `src/**\/*.ts` → `dist/**\/*.js`
 *
 * **중요**: Glob은 파일시스템을 직접 탐색하므로 실제 존재하는 파일 경로를 사용해야 함
 *
 * @param pattern - glob 패턴
 * @param direction - 변환 방향 ('toDev' | 'toProd' | 'auto')
 * @returns 변환된 패턴
 *
 * @example
 * // Dev 모드에서 auto: dist → src, .js → .ts
 * resolveGlobPattern('dist/application/**\/*.model.js')
 * // → 'src/application/**\/*.model.ts'
 *
 * // 명시적 toProd 변환 (환경 무관)
 * resolveGlobPattern('src/application/**\/*.ts', 'toProd')
 * // → 'dist/application/**\/*.js'
 */
export function resolveGlobPattern(
  pattern: string,
  direction: 'toDev' | 'toProd' | 'auto' = 'auto'
): string {
  const isDevMode = isHMREnabled();

  // auto는 현재 환경에 맞춰 변환
  if (direction === 'auto') {
    direction = isDevMode ? 'toDev' : 'toProd';
  }

  if (direction === 'toDev') {
    // dist → src, .js → .ts
    return pattern
      .replace(/\/dist\//g, '/src/')
      .replace(/\.js\*/g, '.ts*')
      .replace(/\.js$/g, '.ts');
  } else {
    // src → dist, .ts → .js
    return pattern
      .replace(/\/src\//g, '/dist/')
      .replace(/\.ts\*/g, '.js*')
      .replace(/\.ts$/g, '.js');
  }
}

/**
 * 파일 경로에서 확장자 변환
 *
 * @param filePath - 파일 경로
 * @param toExtension - 변환할 확장자 ('.ts' 또는 '.js')
 * @returns 변환된 경로
 */
export function changeExtension(
  filePath: string,
  toExtension: '.ts' | '.js'
): string {
  return filePath.replace(/\.(ts|js)$/, toExtension);
}

/**
 * 시스템 절대 경로를 API 상대 경로로 변환합니다.
 *
 * **목적**: 절대 경로 → API 패키지 기준 상대 경로 변환
 *
 * **기준점**: `Sonamu.apiRootPath`
 *
 * **사용처**: sonamu.lock 파일에 경로 저장 시
 *
 * @param absolutePath - 시스템 절대 경로
 * @returns API 상대 경로 (src/ 또는 dist/로 시작)
 *
 * @example
 * toApiRelativePath('/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts')
 * // → 'src/application/user/user.model.ts'
 */
export function toApiRelativePath(absolutePath: AbsolutePath): ApiRelativePath {
  if (!absolutePath.startsWith(Sonamu.apiRootPath)) {
    throw new Error(`Absolute path ${absolutePath} is not within the API root path ${Sonamu.apiRootPath}`);
  }

  const relativePath = path.relative(Sonamu.apiRootPath, absolutePath);
  if (!relativePath.startsWith('src/') && !relativePath.startsWith('dist/')) {
    throw new Error(`Relative path ${relativePath} is not within the API root path ${Sonamu.apiRootPath}`);
  }

  return relativePath as ApiRelativePath;
}

/**
 * @deprecated toApiRelativePath를 사용하세요
 */
export function toProjectRelativePath(absolutePath: AbsolutePath): ProjectRelativePath {
  return toApiRelativePath(absolutePath);
}

/**
 * API 상대 경로를 시스템 절대 경로로 변환합니다.
 *
 * **목적**: API 상대 경로 → 절대 경로 변환
 *
 * **기준점**: `Sonamu.apiRootPath`
 *
 * @param relativePath - API 상대 경로 (src/ 또는 dist/로 시작)
 * @returns 시스템 절대 경로
 *
 * @example
 * toAbsolutePath('src/application/user/user.model.ts')
 * // → '/Users/potados/Projects/sonamu/api/src/application/user/user.model.ts'
 */
export function toAbsolutePath(relativePath: ApiRelativePath): AbsolutePath {
  if (relativePath.startsWith('src/')) {
    return path.join(Sonamu.apiRootPath, relativePath) as AbsolutePath;
  } else if (relativePath.startsWith('dist/')) {
    return path.join(Sonamu.apiRootPath, relativePath) as AbsolutePath;
  }

  if (relativePath.startsWith('/')) {
    console.warn(`Path "${relativePath}" is already an absolute path, so it is returned as is.`);
    return relativePath as AbsolutePath;
  }

  return path.join(Sonamu.apiRootPath, relativePath) as AbsolutePath;
}