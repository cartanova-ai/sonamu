import { clsx } from "clsx";
import { type ClassValue } from "clsx";
import { useMemo, useSyncExternalStore } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 값을 배열로 정규화합니다.
 * 이미 배열이면 그대로 반환하고, 단일 값이면 배열로 감싸서 반환합니다.
 *
 * @param value - 정규화할 값 (단일 값 또는 배열)
 * @returns 배열로 정규화된 값 (undefined면 undefined 반환)
 *
 * @example
 * normalizeToArray(50) // [50]
 * normalizeToArray([20, 80]) // [20, 80]
 * normalizeToArray(undefined) // undefined
 */
export function normalizeToArray<T>(value: T | T[] | undefined): T[] | undefined {
  return value === undefined ? undefined : Array.isArray(value) ? value : [value];
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
 * @param files - 미리보기할 File 객체 배열
 * @returns 생성된 Object URL 문자열 배열
 */
const EMPTY_OBJECT_URLS: string[] = [];

class ObjectUrlStore {
  private urls = EMPTY_OBJECT_URLS;

  constructor(private readonly files: File[]) {}

  getSnapshot = () => this.urls;

  subscribe = (onStoreChange: () => void) => {
    const created = this.files.map((file) => URL.createObjectURL(file));
    this.urls = created;
    onStoreChange();

    return () => {
      for (const url of created) {
        URL.revokeObjectURL(url);
      }
      if (this.urls === created) {
        this.urls = EMPTY_OBJECT_URLS;
      }
    };
  };
}

export function useObjectUrls(files: File[]): string[] {
  const store = useMemo(() => new ObjectUrlStore(files), [files]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY_OBJECT_URLS);
}
