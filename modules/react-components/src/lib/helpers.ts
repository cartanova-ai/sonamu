/** biome-ignore-all lint/suspicious/noExplicitAny: 파싱 결과이므로 any 허용 */

import { useSearch, useNavigate as useTanstackNavigate } from "@tanstack/react-router";
import equal from "fast-deep-equal";
import { get as _get, set as _set, cloneDeep, intersection, isObject, uniq } from "lodash-es";
import qs from "qs";
import React, { type ReactElement, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { caster } from "./caster";

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

type ErrorObj = {
  content: string;
  pointing?: "above" | "below" | "left" | "right";
};
export function useTypeForm<T extends z.ZodObject<any> | z.ZodArray<any>, U extends z.infer<T>>(
  zType: T,
  defaultValue: U,
) {
  const [form, setForm] = useState<z.infer<T>>(defaultValue);
  const [errorObjs, setErrorObjs] = useState<Map<string, ErrorObj>>(new Map());

  function getEmptyStringTo(zType: T, objPath: string): "normal" | "nullable" | "optional" {
    const zTypeObjPath = objPath
      .replace(/\./g, ".shape.")
      .replace(/\[[^\]]+\]/g, ".element")
      .replace(/^\.element/, "element");

    let targetZType: unknown;
    if (zType instanceof z.ZodObject) {
      targetZType = _get(zType.shape, zTypeObjPath);
    } else if (zType instanceof z.ZodArray) {
      targetZType = _get(zType, zTypeObjPath);
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
      const srcValue = _get(form, objPath) as unknown;

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

        const newForm = cloneDeep(form);
        _set(newForm, objPath, processedValue);
        setForm(newForm);
      };

      const result: Record<string, any> = {
        value: srcValue === undefined || srcValue === null ? "" : srcValue,
        onChange: (_e: any, prop?: any) => {
          // semantic-ui 스타일: onChange(_e, { value }) 또는 onChange(_e, { checked })
          if (prop && "value" in prop) {
            updateValue(prop.value);
          } else if (prop && "checked" in prop) {
            updateValue(prop.checked);
          }
        },
      };

      // 체크박스용 checked prop (boolean인 경우만)
      if (typeof srcValue === "boolean") {
        result.checked = srcValue;
      }

      // error가 있으면 추가
      if (error) {
        result.error = error;
      }

      return result;
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

export function useListParams<U extends z.ZodType<any>, T extends Partial<z.infer<U>>>(
  zType: U,
  defaultValue: T,
  options?: {
    disableSearchParams: boolean;
  },
) {
  type ZodKeys = keyof z.infer<U>;
  // 라우팅 searchParams
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParamsToParams(searchParams, zType);

  // 리스트 필터 state
  const [listParams, setListParams] = useState<T>({
    ...defaultValue,
    ...(options?.disableSearchParams !== true ? query : {}),
  });

  // 리스트 필터 변경시에 searchParams 변경
  useEffect(() => {
    const oldSP = paramsToSearchParams({
      ...listParams,
      ...searchParamsToParams(searchParams, zType),
    });
    const newSP = paramsToSearchParams(listParams);

    if (options?.disableSearchParams !== true) {
      setSearchParams(newSP, {
        replace: equal(oldSP, newSP),
      });
    }
  }, [listParams]);

  // searchParams 변경시에 리스트 필터 변경
  useEffect(() => {
    if (options?.disableSearchParams !== true) {
      const query = searchParamsToParams(searchParams, zType);
      const newListParams = {
        ...defaultValue,
        ...query,
      };
      if (equal(newListParams, listParams) === false) {
        setListParams(newListParams);
      }
    }
  }, [searchParams]);

  return {
    listParams,
    setListParams,
    register: (name: ZodKeys): any => {
      if (name === "page") {
        const setPage = (newPage: number) => {
          setListParams({
            ...listParams,
            page: newPage,
          } as any);
        };
        return {
          activePage: (listParams as any).page ?? 1,
          onPageChange: (
            _event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
            data: PaginationProps,
          ) => {
            setPage(Number(data.activePage ?? 1));
          },
          // shadcn-ui 템플릿용 onChange
          onChange: (_e: any, prop?: { value: number }) => {
            if (prop && "value" in prop) {
              setPage(prop.value);
            }
          },
        };
      } else {
        const currentValue = (listParams as any)[name];

        // 공통 업데이트 로직
        const updateListParams = (newValue: any) => {
          setListParams({
            ...listParams,
            page: 1,
            [name]: newValue === "" ? undefined : newValue,
          });
        };

        const result: Record<string, any> = {
          value: currentValue === undefined || currentValue === null ? "" : currentValue,
          onChange: (_e: any, prop?: any) => {
            // semantic-ui 스타일: onChange(_e, { value }) 또는 onChange(_e, { checked })
            if (prop && "value" in prop) {
              updateListParams(prop.value);
            } else if (prop && "checked" in prop) {
              updateListParams(prop.checked);
            }
          },
        };

        // 체크박스용 checked prop (boolean인 경우만)
        if (typeof currentValue === "boolean") {
          result.checked = currentValue;
        }

        return result;
      }
    },
  };
}

export function useGoBack() {
  const location = useLocation();
  const navigate = useNavigate();
  return {
    goBack: (to: string) => {
      if ((location?.state as { from?: string })?.from === to) {
        navigate(-1);
      } else {
        navigate(to);
      }
    },
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
          new Map(uniq([...selectedKeys, ...allKeys.slice(begin, end)]).map((k: T) => [k, true])),
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
  ModalComponent: (props: T & ControlledModalProps) => JSX.Element,
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

/**
 * TanStack Router용 useListParams
 *
 * @tanstack/react-router를 사용하는 페이지에서 사용
 * semantic-ui와 shadcn/ui 모두 지원
 */
export function useListParamsTanstack<U extends z.ZodType<any>, T extends Partial<z.infer<U>>>(
  zType: U,
  defaultValue: T,
  options?: {
    disableSearchParams?: boolean;
  },
) {
  type ZodKeys = keyof z.infer<U>;
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useTanstackNavigate();
  const disableSearchParams = options?.disableSearchParams ?? false;

  // 리스트 필터 state
  const [listParams, setListParams] = useState<T>(() => {
    if (disableSearchParams) {
      return defaultValue;
    }

    const paramsFromUrl: Record<string, unknown> = { ...defaultValue };
    Object.entries(search).forEach(([key, value]) => {
      if (key in defaultValue) {
        const defaultVal = (defaultValue as Record<string, unknown>)[key];
        if (typeof defaultVal === "number") {
          paramsFromUrl[key] = Number(value);
        } else {
          paramsFromUrl[key] = value;
        }
      }
    });

    try {
      return zType.parse(paramsFromUrl);
    } catch {
      return defaultValue;
    }
  });

  // 리스트 필터 변경시에 searchParams 변경
  useEffect(() => {
    if (disableSearchParams) {
      return;
    }

    const newSearch: Record<string, unknown> = {};
    Object.entries(listParams).forEach(([key, value]) => {
      if (value != null && value !== "" && value !== defaultValue[key as keyof T]) {
        newSearch[key] = value;
      }
    });

    // TanStack Router의 search 업데이트
    navigate({ search: newSearch } as any);
  }, [listParams, disableSearchParams, defaultValue, navigate]);

  return {
    listParams,
    setListParams,
    register: (name: ZodKeys): any => {
      if (name === "page") {
        return {
          activePage: (listParams as any).page ?? 1,
          onPageChange: (
            _event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
            data: PaginationProps,
          ) => {
            setListParams({
              ...listParams,
              page: Number(data.activePage ?? 1),
            } as any);
          },
        };
      } else {
        const currentValue = (listParams as any)[name];

        // 공통 업데이트 로직
        const updateListParams = (newValue: any) => {
          setListParams({
            ...listParams,
            page: 1,
            [name]: newValue === "" ? undefined : newValue,
          } as any);
        };

        const result: Record<string, any> = {
          value: currentValue === undefined || currentValue === null ? "" : currentValue,
          onChange: (_e: any, prop?: any) => {
            // semantic-ui 스타일: onChange(_e, { value }) 또는 onChange(_e, { checked })
            if (prop && "value" in prop) {
              updateListParams(prop.value);
            } else if (prop && "checked" in prop) {
              updateListParams(prop.checked);
            }
          },
        };

        // 체크박스용 checked prop (boolean인 경우만)
        if (typeof currentValue === "boolean") {
          result.checked = currentValue;
        }

        return result;
      }
    },
  };
}
