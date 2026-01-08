import { type ClassValue, clsx } from "clsx";
import { useEffect, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * useObjectUrls 훅
 *
 * 로컬 File 객체 배열을 받아서 브라우저 메모리 기반 미리보기용 Object URL을 생성하고,
 * 컴포넌트가 언마운트되거나 파일이 변경될 때 자동으로 메모리를 해제합니다.
 *
 * **동작 방식**:
 * 1. File 배열을 받아서 각 파일마다 `URL.createObjectURL()`로 임시 URL 생성
 * 2. 생성된 URL은 `blob:http://...` 형태로, 브라우저 메모리를 직접 참조
 * 3. 컴포넌트 언마운트나 파일 변경 시 cleanup 함수가 `URL.revokeObjectURL()`로 메모리 해제
 *
 * **최적화 기법**:
 * - `signature`: File 객체의 참조가 아닌 내용(name, size, lastModified)으로 비교
 * - 동일한 파일이면 불필요한 URL 재생성을 방지하여 메모리 누수 방지
 * - File 객체는 매번 새로 생성될 수 있지만, 내용이 같으면 기존 URL 재사용
 *
 * **사용 예시**:
 * ```tsx
 * const [pendingFiles, setPendingFiles] = useState<File[]>([]);
 * const previewUrls = useObjectUrls(pendingFiles);
 *
 * // previewUrls를 img src로 사용
 * {previewUrls.map((url, i) => (
 *   <img key={url} src={url} alt={`Preview ${i}`} />
 * ))}
 * ```
 *
 * @param files - 미리보기할 File 객체 배열
 * @returns 생성된 Object URL 문자열 배열
 */
export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);

  // File 객체의 내용 기반 서명 생성 (참조 비교가 아닌 값 비교)
  const signature = useMemo(
    () => files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|"),
    [files],
  );

  useEffect(() => {
    // Object URL 생성
    const created = files.map((f) => URL.createObjectURL(f));
    setUrls(created);

    // Cleanup: 메모리 누수 방지를 위해 생성된 URL 해제
    return () => {
      for (const url of created) {
        URL.revokeObjectURL(url);
      }
    };
  }, [signature]);

  return urls;
}
