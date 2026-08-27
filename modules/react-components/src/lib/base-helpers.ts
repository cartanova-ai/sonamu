/* oxlint-disable @typescript-eslint/no-explicit-any */ // 파싱 결과이므로 any 허용

import { format } from "date-fns";
import qs from "qs";
import { isObject } from "radashi";
import { type z } from "zod";

import { caster } from "./caster";

// ============================================================================
// UI Utilities
// ============================================================================

export function hidden(condition: boolean | undefined): string {
  return condition === true ? "hidden" : "";
}

// ============================================================================
// URL / Search Params Conversion
// ============================================================================

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
  [key in string]: string | string[];
} {
  return Object.fromEntries(
    // oxlint-disable-next-line unicorn/prefer-array-flat-map -- 여기는 flatMap 사용하면 깨짐
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

// ============================================================================
// Formatting Utilities
// ============================================================================

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
    // toISOString은 UTC로 고정되어 로컬 시간대와 어긋난다. 로컬 기준으로 포맷한다.
    return format(dateValue, "yyyy-MM-dd");
  } else {
    return dateValue.slice(0, 10);
  }
}

export function datetimeF(dateValue: string | Date | null | undefined): string | null {
  if (dateValue === null || dateValue === undefined) {
    return null;
  } else if (dateValue instanceof Date) {
    // toISOString은 UTC로 고정되어 로컬 시간대와 어긋난다. 로컬 기준으로 포맷한다.
    return format(dateValue, "yyyy-MM-dd HH:mm:ss");
  } else {
    return dateValue.slice(0, 19);
  }
}

// ============================================================================
// Array Utilities
// ============================================================================

export function arrayableToArray<T extends number | string | boolean>(
  val: T | T[] | undefined,
): T[] {
  return val ? (Array.isArray(val) ? val : [val]) : [];
}

// ============================================================================
// Function Reference Utilities
// ============================================================================

export function caller<T extends Function>(): { set: (func: T) => void; call: T };
export function caller() {
  let savedFunc: Function | null = null;
  return {
    set: (func: Function) => {
      savedFunc = func;
    },
    call: (...args: unknown[]) => {
      if (savedFunc) {
        savedFunc.call(args);
      }
    },
  };
}
