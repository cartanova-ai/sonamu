/** biome-ignore-all lint/suspicious/noExplicitAny: 파싱 결과이므로 any 허용 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import equal from "fast-deep-equal";
import qs from "qs";
import { get, isObject, set, unique } from "radashi";
import React, { type ReactElement, useEffect, useState } from "react";
import { z } from "zod";
import { useSonamuContext } from "@/contexts/sonamu-context";
import { caster } from "./caster";

// radashi에 intersection이 없으므로 직접 구현
function intersection<T>(arr1: T[], arr2: T[]): T[] {
  return arr1.filter((item) => arr2.includes(item));
}

// shadcn/ui용 타입 정의 (semantic-ui-react 대체)
export type PaginationProps = {
  activePage?: number;
  totalPages?: number;
};

export type TableColumnWidth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;

export function hidden(condition: boolean | undefined): string {
  return condition === true ? "hidden" : "";
}

export function searchParamsToParams<T extends z.ZodType<any>>(
  searchParams: URLSearchParams,
  paramsSchema: T,
): z.infer<T> {
  const obj = qs.parse(searchParams.toString());
  return caster(paramsSchema, obj);
}

export function paramsToSearchParams<T>(params: T): {
  [key in string]: string | string[];
} {
  return Object.fromEntries(
    // biome-ignore lint/complexity/useFlatMap: 여기는 flatMap 사용하면 깨짐
    Object.entries(params as any)
      .filter(([, value]) => {
        return value !== undefined;
      })
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return [[`${key}[]`, value]];
        } else if (isObject(value)) {
          return Object.keys(value).map((subKey) => {
            return [`${key}[${subKey}]`, String(value[subKey as keyof typeof value])];
          });
        } else {
          return [[key, String(value)]];
        }
      })
      .flat(),
  );
}

export type ErrorObj = {
  content: string;
  pointing?: "above" | "below" | "left" | "right";
};

// File 업로드를 위한 재귀적 순회 헬퍼 함수
async function traverseAndUploadFiles(
  value: any,
  uploader: (files: File[]) => Promise<string[]>,
): Promise<any> {
  // File 객체인 경우
  if (value instanceof File) {
    const [url] = await uploader([value]);
    return url;
  }

  // 배열인 경우
  if (Array.isArray(value)) {
    // 모든 요소가 File이면 일괄 업로드
    if (value.length > 0 && value.every((item) => item instanceof File)) {
      return await uploader(value as File[]);
    }
    // 아니면 각 요소를 재귀 처리
    return await Promise.all(value.map((item) => traverseAndUploadFiles(item, uploader)));
  }

  // 객체인 경우 (null 제외)
  if (value !== null && typeof value === "object") {
    const result: any = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = await traverseAndUploadFiles(val, uploader);
    }
    return result;
  }

  // 원시값은 그대로 반환
  return value;
}

export function useTypeForm<T extends z.ZodObject<any> | z.ZodArray<any>, U extends z.infer<T>>(
  zType: T,
  defaultValue: U,
) {
  const [form, setForm] = useState<z.infer<T>>(defaultValue);
  const [errorObjs, setErrorObjs] = useState<Map<string, ErrorObj>>(new Map());
  const { uploader } = useSonamuContext();

  function getEmptyStringTo(zType: T, objPath: string): "normal" | "nullable" | "optional" {
    const zTypeObjPath = objPath
      .replace(/\./g, ".shape.")
      .replace(/\[[^\]]+\]/g, ".element")
      .replace(/^\.element/, "element");

    let targetZType: unknown;
    if (zType instanceof z.ZodObject) {
      targetZType = get(zType.shape, zTypeObjPath);
    } else if (zType instanceof z.ZodArray) {
      targetZType = get(zType, zTypeObjPath);
    }

    if (targetZType === undefined) {
      return "normal";
    } else if (targetZType instanceof z.ZodOptional) {
      return "optional";
    } else if (targetZType instanceof z.ZodNullable) {
      return "nullable";
    }
    return "normal";
  }

  return {
    form,
    setForm,
    register: (objPath: string, _emptyStringTo?: "normal" | "nullable" | "optional"): any => {
      const emptyStringTo = _emptyStringTo ?? getEmptyStringTo(zType, objPath);
      const srcValue = get(form, objPath) as unknown;

      const error = errorObjs.get(objPath);

      // 공통 업데이트 로직
      const updateValue = (newValue: any) => {
        if (error !== undefined) {
          setErrorObjs((p) => {
            const newP = new Map(p);
            newP.delete(objPath);
            return newP;
          });
        }

        let processedValue = newValue;
        if (emptyStringTo === "nullable") {
          processedValue = newValue === "" ? null : newValue;
        } else if (emptyStringTo === "optional") {
          processedValue = newValue === "" ? undefined : newValue;
        }

        setForm(set(form, objPath, processedValue));
      };

      const result: Record<string, any> = {
        value: srcValue === undefined || srcValue === null ? "" : srcValue,
        onValueChange: (value: any) => updateValue(value),
      };

      // error가 있으면 추가
      if (error) {
        result.error = error;
      }

      return result;
    },
    submit:
      <R>(callback: (formData: z.infer<T>) => Promise<R>) =>
      async () => {
        const transformedForm = await traverseAndUploadFiles(form, uploader);
        setForm(transformedForm);
        return await callback(transformedForm);
      },
    addError: (objPath: string, errorMessage: string | ErrorObj): void => {
      setErrorObjs((p) => {
        const newP = new Map(p);
        newP.set(
          objPath,
          typeof errorMessage === "string" ? { content: errorMessage } : errorMessage,
        );
        return newP;
      });
    },
    removeError: (objPath: string): void => {
      setErrorObjs((p) => {
        const newP = new Map(p);
        newP.delete(objPath);
        return newP;
      });
    },
    clearError: (): void => {
      setErrorObjs(new Map());
    },
    reset: (): void => {
      setForm(defaultValue);
    },
  };
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

export function sqlDateToDateString(sqlDateString: string | null) {
  if (sqlDateString === null) {
    return null;
  } else {
    return sqlDateString.slice(0, 10);
  }
}

export function numF(num: number | null | undefined): string | number | undefined | null {
  return num && new Intl.NumberFormat().format(num);
}

export function dateF(dateValue: string | Date | null | undefined): string | null {
  if (dateValue === null || dateValue === undefined) {
    return null;
  } else if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 10);
  } else {
    return dateValue.slice(0, 10);
  }
}
export function datetimeF(dateValue: string | Date | null | undefined): string | null {
  if (dateValue === null || dateValue === undefined) {
    return null;
  } else if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 19).replace("T", " ");
  } else {
    return dateValue.slice(0, 19);
  }
}

export function arrayableToArray<T extends number | string | boolean>(
  val: T | T[] | undefined,
): T[] {
  return val ? (Array.isArray(val) ? val : [val]) : [];
}

export type ControlledModalProps = {
  open: boolean;
  close: () => void;
};

export function useModal<T extends object>(
  ModalComponent: (props: T & ControlledModalProps) => React.ReactElement,
  defaultProps: T,
) {
  const [modalProps, setModalProps] = useState<T & { open: boolean }>({
    ...defaultProps,
    open: false,
  });

  const close = () => {
    setModalProps({
      ...modalProps,
      open: false,
    });
  };

  return {
    open: (newProps: T) => {
      setModalProps({
        ...newProps,
        open: true,
        close,
      });
    },
    modal: React.createElement(ModalComponent, {
      ...modalProps,
      close,
    }),
  };
}

export function caller<T extends Function>() {
  let savedFunc: T | null = null;
  return {
    set: (func: T) => {
      savedFunc = func;
    },
    call: ((...args: unknown[]) => {
      if (savedFunc) {
        savedFunc.call(args);
      }
    }) as unknown as T,
  };
}

export type SonamuCol<T> = {
  label: string;
  th?: ReactElement;
  tc: (row: T, index: number) => ReactElement;
  className?: string;
  collapsing?: boolean;
  width?: TableColumnWidth;
  hidden?: boolean;
  parentLabel?: string;
};

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export type Override<T, U> = Omit<T, keyof U> & U;
