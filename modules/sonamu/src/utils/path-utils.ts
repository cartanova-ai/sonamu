import path from 'path';
import { Sonamu } from '../api/sonamu.js';
import { isHMREnabled } from './esm-utils.js';

type RelativePathStartDirectory = 'src' | 'dist';
export type ProjectRelativePath = `${RelativePathStartDirectory}/${string}`;
export type AbsolutePath = `/${string}`;

/**
 * dev/prod 모드에 따라 모듈 경로 해석
 *
 * Dev 모드: src/*.ts
 * Prod 모드: dist/*.js
 *
 * @param relativePath - API 루트 기준 상대 경로
 * @returns 절대 경로
 *
 * @example
 * // Dev: /path/to/api/src/application/user/user.model.ts
 * // Prod: /path/to/api/dist/application/user/user.model.js
 * resolveModulePath('src/application/user/user.model.ts')
 */
export function resolveModulePath(relativePath: string): string {
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

    return path.join(Sonamu.apiRootPath, srcPath);
  } else {
    // Prod 모드: dist/*.js
    const distPath = cleanPath
      .replace(/^src\//, 'dist/')
      .replace(/\.ts$/, '.js');

    return path.join(Sonamu.apiRootPath, distPath);
  }
}

/**
 * globbing 패턴을 환경 또는 명시적 방향에 맞게 변환 (양방향)
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
 * 시스템 절대 경로를 "src/" 또는 "dist/"로 시작하는 상대 경로로 변환합니다.
 * 기준은 Sonamu.apiRootPath 입니다.
 * @param absolutePath 
 * @returns 
 */
export function toProjectRelativePath(absolutePath: AbsolutePath): ProjectRelativePath {
  if (!absolutePath.startsWith(Sonamu.apiRootPath)) {
    throw new Error(`Absolute path ${absolutePath} is not within the API root path ${Sonamu.apiRootPath}`);
  }

  const relativePath = path.relative(Sonamu.apiRootPath, absolutePath);
  if (!relativePath.startsWith('src/') && !relativePath.startsWith('dist/')) {
    throw new Error(`Relative path ${relativePath} is not within the API root path ${Sonamu.apiRootPath}`);
  }

  return relativePath as ProjectRelativePath;
}

export function toAbsolutePath(relativePath: ProjectRelativePath): AbsolutePath {
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