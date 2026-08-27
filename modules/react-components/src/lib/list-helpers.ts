/* oxlint-disable @typescript-eslint/no-explicit-any */ // 파싱 결과이므로 any 허용

import {
  type RootRoute,
  type Router,
  type NavigateOptions,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import equal from "fast-deep-equal";
import { unique } from "radashi";
import type React from "react";
import { useState } from "react";
import { type z } from "zod";

// radashi에 intersection이 없으므로 직접 구현
function intersection<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter((item) => arr2.includes(item));
}

type ZodKeys<T extends z.ZodType<any>> = keyof z.infer<T>;
interface RouterSearch {}
interface RouterSearchValidator {
  parse(input: RouterSearch): RouterSearch;
}
type ListParamsRouter = Router<RootRoute<unknown, RouterSearchValidator>>;

export function useListParams<U extends z.ZodObject<any>, T extends Partial<z.infer<U>>>(
  zType: U,
  defaultValue: T,
  options?: {
    disableSearchParams?: boolean;
  },
) {
  const search = useSearch({ strict: false });
  const router = useRouter<ListParamsRouter>();

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
  })();

  const setListParams = (newParams: Partial<z.infer<U>>) => {
    if (equal(listParams, newParams)) {
      return;
    }

    const navigation: NavigateOptions<ListParamsRouter> = {
      // 현재 검색 파라미터를 새 목록 상태로 교체하되 직렬화와 히스토리는 라우터에 맡깁니다.
      search: () => newParams,
    };
    router.navigate(navigation);
  };

  function register(name: ZodKeys<U>): any {
    const currentValue = listParams[name];
    const defaultVal = defaultValue[name];

    return {
      value: currentValue ?? defaultVal ?? (name === "page" ? 1 : ""),
      onValueChange: (value: any) => {
        if (name === "page") {
          setListParams(zType.parse({ ...listParams, page: value }));
        } else {
          setListParams(
            zType.parse({
              ...listParams,
              page: 1,
              [name]: value === "" ? undefined : value,
            }),
          );
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
  const [selection, setSelection] = useState(
    new Map(allKeys.map((key) => [key, defaultSelectedKeys.includes(key)])),
  );
  const [lastIndex, setLastIndex] = useState(0);

  // 전체 키에서 제거된 선택 항목은 같은 렌더에서 정리합니다.
  const selectionKeys = Array.from(selection.keys());
  if (intersection(allKeys, selectionKeys).length !== selectionKeys.length) {
    setSelection(new Map(Array.from(selection).filter(([key]) => allKeys.includes(key))));
  }

  const selectedKeys = Array.from(selection)
    .filter(([key, value]) => allKeys.includes(key) && value)
    .map(([key]) => key);

  return {
    getSelected: (key: T) => selection.get(key) ?? false,
    toggle: (key: T) => {
      setSelection((currentSelection) => {
        return new Map([...currentSelection, [key, !(currentSelection.get(key) ?? false)]]);
      });
    },
    selectedKeys,
    deselectAll: () => setSelection(new Map(allKeys.map((key) => [key, false]))),
    selectAll: () => setSelection(new Map(allKeys.map((key) => [key, true]))),
    isAllSelected: selectedKeys.length === allKeys.length,
    handleCheckboxClick: (e: React.MouseEvent<HTMLInputElement>, index: number) => {
      const input = e.currentTarget.getElementsByTagName("input");
      if (e.shiftKey && !input[0]?.checked) {
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
