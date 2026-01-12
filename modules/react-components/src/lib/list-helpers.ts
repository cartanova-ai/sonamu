/** biome-ignore-all lint/suspicious/noExplicitAny: 파싱 결과이므로 any 허용 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import equal from "fast-deep-equal";
import { unique } from "radashi";
import type React from "react";
import { useEffect, useState } from "react";
import type { z } from "zod";

// radashi에 intersection이 없으므로 직접 구현
function intersection<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter((item) => arr2.includes(item));
}

type ZodKeys<T extends z.ZodType<any>> = keyof z.infer<T>;

export function useListParams<U extends z.ZodType<any>, T extends Partial<z.infer<U>>>(
  zType: U,
  defaultValue: T,
  options?: {
    disableSearchParams?: boolean;
  },
) {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();

  // URL에서 파라미터 파싱
  const listParams = (() => {
    if (options?.disableSearchParams) {
      return defaultValue;
    }

    const parsed = zType.safeParse(search);
    if (parsed.success) {
      return { ...defaultValue, ...parsed.data };
    }
    return defaultValue;
  })() as T;

  const setListParams = (newParams: T) => {
    if (equal(listParams, newParams)) {
      return;
    }

    navigate({
      search: newParams as any,
    });
  };

  function register(name: ZodKeys<U>): any {
    const currentValue = (listParams as any)[name];
    const defaultVal = (defaultValue as any)[name];

    return {
      value: currentValue ?? defaultVal ?? (name === "page" ? 1 : ""),
      onValueChange: (value: any) => {
        if (name === "page") {
          setListParams({ ...listParams, page: value } as T);
        } else {
          setListParams({
            ...listParams,
            page: 1,
            [name]: value === "" ? undefined : value,
          } as T);
        }
      },
    };
  }

  return {
    listParams,
    setListParams,
    register,
  };
}

export function useSelection<T>(allKeys: T[], defaultSelectedKeys: T[] = []) {
  const [selection, setSelection] = useState<Map<T, boolean>>(
    new Map(allKeys.map((key) => [key, defaultSelectedKeys.includes(key)])),
  );
  const [lastIndex, setLastIndex] = useState<number>(0);

  // 전체 키가 바뀔 때마다 validation하여 갱신된 전체 키에 포함된 키만 유지
  useEffect(() => {
    const selectionKeys = Array.from(selection.keys());
    if (intersection(allKeys, selectionKeys).length === selectionKeys.length) {
      return;
    }

    setSelection(new Map(Array.from(selection).filter(([key, _value]) => allKeys.includes(key))));
  }, [allKeys, selection]);

  const selectedKeys = Array.from(selection)
    .filter(([key, value]) => allKeys.includes(key) && value === true)
    .map(([key]) => key);

  return {
    getSelected: (key: T) => selection.get(key) ?? false,
    toggle: (key: T) => {
      setSelection((selection) => {
        return new Map([...selection, [key, !(selection.get(key) ?? false)]]);
      });
    },
    selectedKeys,
    deselectAll: () => setSelection(new Map(allKeys.map((key) => [key, false]))),
    selectAll: () => setSelection(new Map(allKeys.map((key) => [key, true]))),
    isAllSelected: selectedKeys.length === allKeys.length,
    handleCheckboxClick: (e: React.MouseEvent<HTMLInputElement, MouseEvent>, index: number) => {
      const input = e.currentTarget.getElementsByTagName("input");
      if (e.shiftKey && input[0]?.checked === false) {
        const [begin, end] = (() => {
          if (lastIndex < index) {
            return [lastIndex, index];
          } else {
            return [index + 1, lastIndex];
          }
        })();
        setSelection(
          new Map(unique([...selectedKeys, ...allKeys.slice(begin, end)]).map((k: T) => [k, true])),
        );
      } else {
        setLastIndex(index);
      }
    },
  };
}
