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
 * @returns hot reload 환경인지 여부
 */
export function isHotReloadServer(): boolean {
  return process.env.HOT === 'yes';
}

/**
 * 캐시를 무시하고 새로 임포트(cache busting)합니다.
 * 
 * 이렇게 하면 당연히 memory leak이 생깁니다만, 문제될 수준은 아닙니다.
 * 자세한 내용은 https://adonisjs.com/blog/hmr-in-adonisjs#memory-leaks 이거 한번 읽어보시면 좋습니다.
 * 
 * @param filePath
 * @returns
 */
export async function importFresh(filePath: string) {
  // 그냥 절대경로("/User/potados/.../user.model.ts"처럼)로 임포트하면 문제가 생깁니다.
  // 이를 피하기 위해서는 fully-resolved URL을 사용해야 합니다.
  const importUrl = createImportUrl(filePath);

  return await import(`${importUrl}?hot=${Date.now()}`);
}

/**
 * 캐시를 무시하고 새로 임포트(cache busting)하는데, 이때 가져온 모듈의 exported members들을 배열로 가져옵니다.
 *
 * 가령 모듈에서 `export const user = { id: number; name: string; }` 이렇게 정의했다면,
 * 이 함수는 `[{ name: "user", value: { id: number; name: string; } }]` 이렇게 반환합니다.
 *
 * @param filePath
 * @returns { name: string; value: ExportedMemberT }[]
 */
export async function importMembersFresh<ExportedMemberT>(
  filePath: string
): Promise<{ name: string; value: ExportedMemberT }[]> {
  const imported = await importFresh(filePath);

  const allExportedMembers = Object.entries<ExportedMemberT>(imported).map(
    ([name, value]) => ({ name, value })
  );

  return allExportedMembers;
}
