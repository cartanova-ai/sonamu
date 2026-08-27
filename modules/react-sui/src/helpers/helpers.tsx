import { format } from "date-fns";
import equal from "fast-deep-equal";
import qs from "qs";
import { get, isObject, set, unique } from "radashi";
import type React from "react";
import { useEffect, useState } from "react";
import { type ReactElement } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { type PaginationProps, type SemanticWIDTHS } from "semantic-ui-react";
import { z } from "zod";

import { caster } from "./caster";

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

export function paramsToSearchParams<T extends object>(
  params: T,
): {
  [key in Extract<keyof T, string>]: string | string[];
} {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => {
        return value !== undefined;
      })
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return [[`${key}[]`, value]];
        } else if (isObject(value)) {
          return Object.entries(value).map(([subKey, subValue]) => {
            return [`${key}[${subKey}]`, String(subValue)];
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

type RegisteredFieldProps = {
  value: ReturnType<typeof formatValue>;
  onChange: (_event: any, props: any) => void;
  error?: ErrorObj;
};

function getEmptyStringTo(
  innerZType: z.ZodObject<any> | z.ZodArray<any>,
  objPath: string,
): "normal" | "nullable" | "optional" {
  const zTypeObjPath = objPath
    .replace(/\./g, ".shape.")
    .replace(/\[[^\]]+\]/g, ".element")
    .replace(/^\.element/, "element");

  let targetZType: unknown;
  if (innerZType instanceof z.ZodObject) {
    targetZType = get(innerZType.def["shape"], zTypeObjPath);
  } else if (innerZType instanceof z.ZodArray) {
    targetZType = get(innerZType, zTypeObjPath);
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

type FormFieldValue = string | number | boolean | Date | readonly string[] | null | undefined;

function formatValue(value: FormFieldValue): Exclude<FormFieldValue, null | undefined> {
  if (value === undefined || value === null) {
    return "";
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return format(value, "yyyy-MM-dd'T'HH:mm");
  }
  return value;
}

export function useTypeForm<T extends z.ZodObject<any> | z.ZodArray<any>>(
  zType: T,
  defaultValue: z.infer<T>,
) {
  const [form, setForm] = useState<z.infer<T>>(defaultValue);
  const [errorObjs, setErrorObjs] = useState(new Map());

  return {
    form,
    setForm,
    register: (objPath: string, _emptyStringTo?: "normal" | "nullable" | "optional"): any => {
      const emptyStringTo = _emptyStringTo ?? getEmptyStringTo(zType, objPath);
      const srcValue: FormFieldValue = get(form, objPath);

      const error = errorObjs.get(objPath);
      const fieldProps: RegisteredFieldProps = {
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

          setForm(set(form, objPath, newValue));
        },
      };
      if (error !== undefined) {
        fieldProps.error = error;
      }
      return fieldProps;
    },
    addError: (objPath: string, errorMessage: string | ErrorObj): void => {
      setErrorObjs((p) => {
        const newP = new Map(p);
        const message = z.string().safeParse(errorMessage);
        newP.set(objPath, message.success ? { content: message.data } : errorMessage);
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
  },
) {
  // 라우팅 searchParams
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParamsToParams(searchParams, zType);
  const disableSearchParams = options?.disableSearchParams === true;
  const searchParamsKey = searchParams.toString();

  // 리스트 필터 state
  const [listState, setListState] = useState(() => {
    const initialParams = { ...defaultValue };
    if (!disableSearchParams) {
      Object.assign(initialParams, query);
    }
    return { params: initialParams, searchParamsKey };
  });

  if (!disableSearchParams && listState.searchParamsKey !== searchParamsKey) {
    setListState({
      params: { ...defaultValue, ...query },
      searchParamsKey,
    });
  }

  const listParams = listState.params;
  const setListParams = (params: T) => {
    setListState((state) => ({ ...state, params }));
  };

  // 리스트 필터 변경시에 searchParams 변경
  useEffect(() => {
    const oldSP = paramsToSearchParams({
      ...listParams,
      ...searchParamsToParams(searchParams, zType),
    });
    const newSP = paramsToSearchParams(listParams);

    if (!disableSearchParams) {
      setSearchParams(newSP, {
        replace: equal(oldSP, newSP),
      });
    }
  }, [disableSearchParams, listParams, searchParams, setSearchParams, zType]);

  return {
    listParams,
    setListParams,
    register: (name: keyof T): any => {
      if (name === "page") {
        return {
          activePage: listParams.page ?? 1,
          onPageChange: (_event: React.MouseEvent<HTMLAnchorElement>, data: PaginationProps) => {
            setListParams({
              ...listParams,
              page: Number(data.activePage ?? 1),
            });
          },
        };
      } else {
        return {
          value:
            listParams[name] === undefined || listParams[name] === null ? "" : listParams[name],
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
      const locationState = z.object({ from: z.string().optional() }).safeParse(location.state);
      if (locationState.success && locationState.data.from === to) {
        navigate(-1);
      } else {
        navigate(to);
      }
    },
  };
}

export function useSelection<T>(allKeys: T[], defaultSelectedKeys: T[] = []) {
  const [selection, setSelection] = useState(
    new Map(allKeys.map((key) => [key, defaultSelectedKeys.includes(key)])),
  );
  const [lastIndex, setLastIndex] = useState(0);

  // 현재 전체 키에서 사라진 항목은 렌더링 결과에서 제외한다.
  const currentSelection = new Map(Array.from(selection).filter(([key]) => allKeys.includes(key)));
  if (currentSelection.size !== selection.size) {
    setSelection(currentSelection);
  }
  const selectedKeys = Array.from(currentSelection)
    .filter(([key, value]) => allKeys.includes(key) && value)
    .map(([key]) => key);

  return {
    getSelected: (key: T) => currentSelection.get(key) ?? false,
    toggle: (key: T) => {
      setSelection((prev) => {
        return new Map([...prev, [key, !(prev.get(key) ?? false)]]);
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
          new Map(unique([...selectedKeys, ...allKeys.slice(begin, end)]).map((k) => [k, true])),
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

export function dateF(sqlDateStringOrDate: Date | string | null | undefined): string | null {
  if (sqlDateStringOrDate === null || sqlDateStringOrDate === undefined) {
    return null;
  } else if (sqlDateStringOrDate instanceof Date) {
    return format(sqlDateStringOrDate, "yyyy-MM-dd");
  } else {
    return sqlDateStringOrDate.slice(0, 10);
  }
}
export function datetimeF(sqlDateStringOrDate: Date | string | null | undefined): string | null {
  if (sqlDateStringOrDate === null || sqlDateStringOrDate === undefined) {
    return null;
  } else if (sqlDateStringOrDate instanceof Date) {
    return format(sqlDateStringOrDate, "yyyy-MM-dd HH:mm:ss");
  } else {
    return sqlDateStringOrDate.slice(0, 19);
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
  val: T | T[] | undefined,
): T[] {
  return val ? (Array.isArray(val) ? val : [val]) : [];
}

export type ControlledModalProps = {
  open: boolean;
  close: () => void;
};
export function useModal<T extends object>(
  ModalComponent: (props: T & ControlledModalProps) => ReactElement,
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
type CallerResult = object | string | number | boolean | bigint | symbol | null | undefined | void;

export function caller<T extends (...args: never[]) => CallerResult>() {
  let savedFunc: T | null = null;
  return {
    set: (func: T) => {
      savedFunc = func;
    },
    call: (...args: Parameters<T>): ReturnType<T> | undefined => {
      if (savedFunc) {
        // SAFETY: args와 반환값은 저장된 함수 T의 Parameters와 ReturnType을 그대로 사용합니다.
        return savedFunc(...args) as ReturnType<T>;
      }
      return undefined;
    },
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

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
