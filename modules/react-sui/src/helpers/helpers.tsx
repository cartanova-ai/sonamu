import React, { ReactElement } from "react";
import { useEffect, useState } from "react";
import { intersection, isObject, uniq, get, cloneDeep, set } from "lodash-es";
import { z } from "zod";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PaginationProps, SemanticWIDTHS } from "semantic-ui-react";
import equal from "fast-deep-equal";
import qs from "qs";
import { format } from "date-fns";
import { caster } from "./caster";

export function hidden(condition: boolean | undefined): string {
  return condition === true ? "hidden" : "";
}

export function searchParamsToParams<T extends z.ZodType<any>>(
  searchParams: URLSearchParams,
  paramsSchema: T
): z.infer<T> {
  const obj = qs.parse(searchParams.toString());
  return caster(paramsSchema, obj);
}

export function paramsToSearchParams<T>(params: T): {
  [key in string]: string | string[];
} {
  return Object.fromEntries(
    Object.entries(params as any)
      .filter(([, value]) => {
        return value !== undefined;
      })
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return [[key + "[]", value]];
        } else if (isObject(value)) {
          return Object.keys(value).map((subKey) => {
            return [
              `${key}[${subKey}]`,
              String(value[subKey as keyof typeof value]),
            ];
          });
        } else {
          return [[key, String(value)]];
        }
      })
      .flat()
  );
}

type ErrorObj = {
  content: string;
  pointing?: "above" | "below" | "left" | "right";
};
export function useTypeForm<
  T extends z.ZodObject<any> | z.ZodArray<any>,
  U extends z.infer<T>,
>(zType: T, defaultValue: U) {
  const [form, setForm] = useState<z.infer<T>>(defaultValue);
  const [errorObjs, setErrorObjs] = useState<Map<string, ErrorObj>>(new Map());

  function getEmptyStringTo(
    zType: T,
    objPath: string
  ): "normal" | "nullable" | "optional" {
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
    register: (
      objPath: string,
      _emptyStringTo?: "normal" | "nullable" | "optional"
    ): any => {
      const emptyStringTo = _emptyStringTo ?? getEmptyStringTo(zType, objPath);
      const srcValue = get(form, objPath) as unknown;

      const formatValue = (value: unknown): string => {
        if (value === undefined || value === null) {
          return "";
        }
        if (value instanceof Date && !isNaN(value.getTime())) {
          return format(value, "yyyy-MM-dd'T'HH:mm");
        }
        return value as string;
      };

      const error = errorObjs.get(objPath);
      return {
        value: formatValue(srcValue),
        onChange: (_e: any, prop: any) => {
          if (error !== undefined) {
            setErrorObjs((p) => {
              const newP = new Map(p);
              newP.delete(objPath);
              return newP;
            });
          }
          let newValue = prop.value;
          if (emptyStringTo === "nullable") {
            newValue = prop.value === "" ? null : prop.value;
          } else if (emptyStringTo === "optional") {
            newValue = prop.value === "" ? undefined : prop.value;
          }

          const newForm = cloneDeep(form);
          set(newForm, objPath, newValue);
          setForm(newForm);
        },
        ...(error && { error }),
      };
    },
    addError: (objPath: string, errorMessage: string | ErrorObj): void => {
      setErrorObjs((p) => {
        const newP = new Map(p);
        newP.set(
          objPath,
          typeof errorMessage === "string"
            ? { content: errorMessage }
            : errorMessage
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

export function useListParams<U extends z.ZodType<any>, T extends z.infer<U>>(
  zType: U,
  defaultValue: T,
  options?: {
    disableSearchParams: boolean;
  }
) {
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
    register: (name: keyof T): any => {
      if (name === "page") {
        return {
          activePage: listParams.page ?? 1,
          onPageChange: (
            _event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
            data: PaginationProps
          ) => {
            setListParams({
              ...listParams,
              page: Number(data.activePage ?? 1),
            });
          },
        };
      } else {
        return {
          value:
            listParams[name] === undefined || listParams[name] === null
              ? ""
              : listParams[name],
          onChange: (_e: any, prop: any) => {
            setListParams({
              ...listParams,
              page: 1,
              [name]: prop.value === "" ? undefined : prop.value,
            });
          },
        };
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
    new Map(allKeys.map((key) => [key, defaultSelectedKeys.includes(key)]))
  );
  const [lastIndex, setLastIndex] = useState<number>(0);

  // 전체 키가 바뀔 때마다 validation하여 갱신된 전체 키에 포함된 키만 유지
  useEffect(() => {
    const selectionKeys = Array.from(selection.keys());
    if (intersection(allKeys, selectionKeys).length === selectionKeys.length) {
      return;
    }

    setSelection(
      new Map(
        Array.from(selection).filter(([key, _value]) => allKeys.includes(key))
      )
    );
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
    deselectAll: () =>
      setSelection(new Map(allKeys.map((key) => [key, false]))),
    selectAll: () => setSelection(new Map(allKeys.map((key) => [key, true]))),
    isAllSelected: selectedKeys.length === allKeys.length,
    handleCheckboxClick: (
      e: React.MouseEvent<HTMLInputElement, MouseEvent>,
      index: number
    ) => {
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
          new Map(
            uniq([...selectedKeys, ...allKeys.slice(begin, end)]).map((k) => [
              k,
              true,
            ])
          )
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

export function numF(
  num: number | null | undefined
): string | number | undefined | null {
  return num && new Intl.NumberFormat().format(num);
}

export function dateF(sqlDateString: string | null | undefined): string | null {
  if (sqlDateString === null || sqlDateString === undefined) {
    return null;
  } else {
    return sqlDateString.slice(0, 10);
  }
}
export function datetimeF(
  sqlDateString: string | null | undefined
): string | null {
  if (sqlDateString === null || sqlDateString === undefined) {
    return null;
  } else {
    return sqlDateString.slice(0, 19);
  }
}

export function formatDate(date: Date | null | undefined): string | null {
  if (date === null || date === undefined) {
    return null;
  }
  return format(date, "yyyy-MM-dd");
}

export function formatDateTime(date: Date | null | undefined): string | null {
  if (date === null || date === undefined) {
    return null;
  }
  return format(date, "yyyy-MM-dd HH:mm:ss");
}

export function arrayableToArray<T extends number | string | boolean>(
  val: T | T[] | undefined
): T[] {
  return val ? (Array.isArray(val) ? val : [val]) : [];
}

export type ControlledModalProps = {
  open: boolean;
  close: () => void;
};
export function useModal<T extends object>(
  ModalComponent: (props: T & ControlledModalProps) => JSX.Element,
  defaultProps: T
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
    modal: (
      <ModalComponent
        {...{
          ...modalProps,
          close,
        }}
      />
    ),
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
  width?: SemanticWIDTHS;
  hidden?: boolean;
  parentLabel?: string;
};

export type DistributiveOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;
