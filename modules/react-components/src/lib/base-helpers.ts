/** biome-ignore-all lint/suspicious/noExplicitAny: 파싱 결과이므로 any 허용 */

import qs from "qs";
import { isObject } from "radashi";
import type { z } from "zod";
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
