import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

/**
 * import.meta.url로부터 __filename 생성
 *
 * @example
 * const __filename = getFilename(import.meta.url);
 */
export function getFilename(metaUrl: string): string {
  return fileURLToPath(metaUrl);
}

/**
 * import.meta.url로부터 __dirname 생성
 *
 * @example
 * const __dirname = getDirname(import.meta.url);
 */
export function getDirname(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

/**
 * 절대 경로를 file:// URL로 변환 (동적 임포트용)
 *
 * @param absolutePath - 절대 파일 경로
 * @returns file:// URL 문자열
 *
 * @example
 * const url = createImportUrl('/path/to/file.js');
 * await import(url);
 */
export function createImportUrl(
  absolutePath: string
): string {
  const fileUrl = pathToFileURL(absolutePath).href;
  return fileUrl;
}

/**
 * HMR 환경 감지
 *
 * @returns dev 환경(dynohot)인지 여부
 */
export function isHMREnabled(): boolean {
  return typeof (import.meta as any).hot !== 'undefined';
}

/**
 * dev 모드 감지
 *
 * @returns dev/prod 모드 구분
 */
export function isDevMode(): boolean {
  return isHMREnabled() || process.env.NODE_ENV === 'development';
}

