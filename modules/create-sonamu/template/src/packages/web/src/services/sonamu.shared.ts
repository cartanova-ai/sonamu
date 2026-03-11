/**
 * @generated
 * 최초 1회 생성되며, 이후에는 덮어쓰지 않습니다.
 * 필요시 직접 수정할 수 있습니다.
 */
/** biome-ignore-all lint/correctness/useExhaustiveDependencies: shared */
/** biome-ignore-all lint/suspicious/noExplicitAny: shared */

/*
  fetch
*/
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import qs from "qs";
import { type core, z } from "zod";
import { EventSource } from "eventsource";
import { getCurrentLocale } from "../i18n/sd.generated";

// ISO 8601 및 타임존 포맷의 날짜 문자열을 Date 객체로 변환하는 reviver
export function dateReviver(_key: string, value: any): any {
  if (typeof value === "string") {
    // ISO 8601 형식: 2024-01-15T09:30:00.000Z 또는 2024-01-15T09:30:00+09:00
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

    // Timezone 포맷: 2024-01-15 09:30:00+09:00
    const timezoneRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

    if (
      (isoRegex.test(value) || timezoneRegex.test(value)) &&
      new Date(value).toString() !== "Invalid Date"
    ) {
      return new Date(value);
    }
  }
  return value;
}

axios.defaults.transformResponse = [
  (data) => {
    if (typeof data === "string") {
      try {
        return JSON.parse(data, dateReviver);
      } catch {
        return data;
      }
    }
    return data;
  },
];

axios.interceptors.request.use((config) => {
  config.headers["Accept-Language"] = getCurrentLocale();
  return config;
});

export async function fetch(options: AxiosRequestConfig) {
  try {
    const res = await axios({
      ...options,
    });
    return res.data;
  } catch (e: unknown) {
    if (axios.isAxiosError(e) && e.response && e.response.data) {
      const d = e.response.data as {
        message: string;
        issues: core.$ZodIssue[];
      };
      throw new SonamuError(e.response.status, d.message, d.issues);
    }
    throw e;
  }
}

export function toFormData(
  obj: Record<string, unknown>,
  formData = new FormData(),
  prefix = "",
): FormData {
  for (const [key, value] of Object.entries(obj)) {
    const formKey = prefix ? `${prefix}[${key}]` : key;

    if (value instanceof File || value instanceof Blob) {
      formData.append(formKey, value);
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        toFormData({ [index]: item }, formData, formKey);
      });
    } else if (value !== null && value !== undefined && typeof value === "object") {
      toFormData(value as Record<string, unknown>, formData, formKey); // 재귀로 펼치기
    } else if (value !== null && value !== undefined) {
      formData.append(formKey, String(value));
    }
  }

  return formData;
}

export class SonamuError extends Error {
  isSonamuError: boolean;

  constructor(
    public code: number,
    public message: string,
    public issues: z.ZodIssue[],
  ) {
    super(message);
    this.isSonamuError = true;
  }
}
export function isSonamuError(e: any): e is SonamuError {
  return e && e.isSonamuError === true;
}

export function defaultCatch(e: any) {
  if (isSonamuError(e)) {
    alert(e.message);
  } else {
    alert("에러 발생");
  }
}

/*
  Isomorphic Types
*/
// semanticQuery가 있으면 similarity를 추가하는 조건부 타입
type WithSimilarity<LP, T> = LP extends { semanticQuery: Record<string, unknown> }
  ? T & { similarity: number }
  : T;

export type ListResult<
  LP extends { queryMode?: SonamuQueryMode },
  T,
> = LP["queryMode"] extends "list"
  ? { rows: WithSimilarity<LP, T>[] }
  : LP["queryMode"] extends "count"
    ? { total: number }
    : { rows: WithSimilarity<LP, T>[]; total: number };

export const SonamuQueryMode = z.enum(["both", "list", "count"]);
export type SonamuQueryMode = z.infer<typeof SonamuQueryMode>;

/* Filter Types */
// Prop 타입별 허용 연산자
export const operatorsByPropType = {
  string: ["eq", "ne", "contains", "startsWith", "endsWith", "in", "notIn", "isNull", "isNotNull"],
  integer: ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn", "between", "isNull", "isNotNull"],
  numeric: ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn", "between", "isNull", "isNotNull"],
  boolean: ["eq", "ne", "isNull", "isNotNull"],
  date: ["eq", "ne", "before", "after", "between", "isNull", "isNotNull"],
  datetime: ["eq", "ne", "before", "after", "between", "isNull", "isNotNull"],
  enum: ["eq", "ne", "in", "notIn", "isNull", "isNotNull"],
  json: ["isNull", "isNotNull"],
} as const;

// Prop 타입별 기본 연산자
export const defaultOperatorByPropType = {
  string: "contains",
  integer: "eq",
  numeric: "eq",
  boolean: "eq",
  date: "eq",
  datetime: "eq",
  enum: "eq",
  json: "isNull",
} as const;

// operatorsByPropType에서 파생되는 타입들
export type FilterPropType = keyof typeof operatorsByPropType;
export type FilterOperator = (typeof operatorsByPropType)[keyof typeof operatorsByPropType][number];

// 특정 prop 타입에 허용되는 연산자 유니온
type OperatorForPropType<TPropType extends FilterPropType> =
  (typeof operatorsByPropType)[TPropType][number];

// 연산자별 기대 값 타입
type OperatorValue<T, K extends FilterOperator> = K extends "in" | "notIn"
  ? T[]
  : K extends "between"
    ? [T, T]
    : K extends "isNull" | "isNotNull"
      ? boolean
      : T;

// 특정 연산자 집합에 대한 필터 조건 타입
type ConditionForOperators<T, TOps extends FilterOperator> =
  | T
  | { [K in TOps]?: OperatorValue<T, K> };

/**
 * 필터 조건 - 타입에 따라 사용 가능한 연산자가 제한
 */
export type FilterCondition<T> =
  NonNullable<T> extends number
    ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"integer">>
    : NonNullable<T> extends string
      ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"string">>
      : NonNullable<T> extends Date
        ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"date">>
        : NonNullable<T> extends boolean
          ? ConditionForOperators<NonNullable<T>, OperatorForPropType<"boolean">>
          : // Fallback: 비원시 타입은 null 체크만 허용
            ConditionForOperators<NonNullable<T>, OperatorForPropType<"json">>;

/**
 * 필터 쿼리
 * 엔티티의 각 필드에 대한 필터 조건 정의
 */
export type FilterQuery<TEntity, TNumericKeys extends keyof TEntity = never> = {
  [K in keyof TEntity]?: K extends TNumericKeys
    ? ConditionForOperators<NonNullable<TEntity[K]>, OperatorForPropType<"numeric">>
    : FilterCondition<TEntity[K]>;
};

/**
 * Sonamu 필터 적용 타입
 * Entity에서 제외할 필드와 numeric 필드를 받아서 최종 FilterQuery 타입을 생성
 */
export type ApplySonamuFilter<
  TEntity,
  TOmitKeys extends keyof TEntity = never,
  TNumericKeys extends Exclude<keyof TEntity, TOmitKeys> = never,
> = FilterQuery<Omit<TEntity, TOmitKeys>, TNumericKeys>;

/**
 * 필드명과 값을 기반으로 FilterPropType을 추론
 */
export function getFieldPropType(
  fieldName: string,
  value: any,
  numericColumns: readonly string[],
): FilterPropType {
  // numeric 타입 체크 (명시적으로 지정된 컬럼)
  if (numericColumns.includes(fieldName)) {
    return "numeric";
  }

  // 값 기반 타입 추론
  if (value instanceof Date) {
    // Date 객체의 시간 정보 확인
    const hasTime = value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
    return hasTime ? "datetime" : "date";
  }

  if (typeof value === "number") {
    return "integer";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  // JSON 타입 (객체/배열)
  if (value !== null && typeof value === "object") {
    return "json";
  }

  // 기본값: string
  return "string";
}

/* Semantic Query */
export const SonamuSemanticParams = z.object({
  semanticQuery: z.object({
    embedding: z.array(z.number()).min(1024).max(1024),
    threshold: z.number().optional(),
    method: z.enum(["cosine", "l2", "inner_product"]).optional(),
  }),
});
export type SonamuSemanticParams = z.infer<typeof SonamuSemanticParams>;

/*
  Utils
*/
export function zArrayable<T extends z.ZodTypeAny>(
  shape: T,
): z.ZodUnion<readonly [T, z.ZodArray<T>]> {
  return z.union([shape, shape.array()]);
}

/*
  Custom Scalars
*/
export const SQLDateTimeString = z
  .string()
  .regex(/([0-9]{4}-[0-9]{2}-[0-9]{2}( [0-9]{2}:[0-9]{2}:[0-9]{2})*)$/, {
    message: "잘못된 SQLDate 타입",
  })
  .min(10)
  .max(19)
  .describe("SQLDateTimeString");
export type SQLDateTimeString = z.infer<typeof SQLDateTimeString>;

/**
 * SonamuFile Types
 */
export interface SonamuFile {
  name: string;
  url: string;
  mime_type: string;
  size: number;
}

export const SonamuFileSchema = z.object({
  name: z.string(),
  url: z.string(),
  mime_type: z.string(),
  size: z.number(),
});

export const SonamuFileArraySchema = z.array(SonamuFileSchema);

/*
  Stream
*/
export type SSEStreamOptions = {
  enabled?: boolean;
  retry?: number;
  retryInterval?: number;
};
export type SSEStreamState = {
  isConnected: boolean;
  error: string | null;
  retryCount: number;
  isEnded: boolean;
};
export type EventHandlers<T> = {
  [K in keyof T]: (data: T[K]) => void;
};

import { useEffect, useRef, useState } from "react";

export function useSSEStream<T extends Record<string, any>>(
  url: string,
  params: Record<string, any>,
  handlers: {
    [K in keyof T]?: (data: T[K]) => void;
  },
  options: SSEStreamOptions = {},
): SSEStreamState {
  const { enabled = true, retry = 3, retryInterval = 3000 } = options;

  const [state, setState] = useState<SSEStreamState>({
    isConnected: false,
    error: null,
    retryCount: 0,
    isEnded: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef(handlers);

  // handlers를 ref로 관리해서 재연결 없이 업데이트
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // 연결 함수
  const connect = () => {
    if (!enabled) return;

    try {
      // 기존 연결이 있으면 정리
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // 재시도 타이머 정리
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      // URL에 파라미터 추가
      const queryString = qs.stringify(params);
      const fullUrl = queryString ? `${url}?${queryString}` : url;

      const eventSource = new EventSource(fullUrl, {
        fetch: (url, init) =>
          globalThis.fetch(url, {
            ...init,
            headers: {
              ...init?.headers,
              "Accept-Language": getCurrentLocale(),
            },
          }),
      });
      eventSourceRef.current = eventSource;

      // 연결 시도 중 상태 표시
      setState((prev) => ({
        ...prev,
        isConnected: false,
        error: null,
        isEnded: false,
      }));

      eventSource.onopen = () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          error: null,
          retryCount: 0,
          isEnded: false,
        }));
      };

      eventSource.onerror = (_event) => {
        // 이미 다른 연결로 교체되었는지 확인
        if (eventSourceRef.current !== eventSource) {
          return; // 이미 새로운 연결이 있으면 무시
        }

        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: "Connection failed",
          isEnded: false,
        }));

        // 자동 재연결 시도
        if (state.retryCount < retry) {
          retryTimeoutRef.current = setTimeout(() => {
            // 여전히 같은 연결인지 확인
            if (eventSourceRef.current === eventSource) {
              setState((prev) => ({
                ...prev,
                retryCount: prev.retryCount + 1,
                isEnded: false,
              }));
              connect();
            }
          }, retryInterval);
        } else {
          setState((prev) => ({
            ...prev,
            error: `Connection failed after ${retry} attempts`,
          }));
        }
      };

      // 공통 'end' 이벤트 처리 (사용자 정의 이벤트와 별도)
      eventSource.addEventListener("end", () => {
        console.log("SSE 연결 정상종료");
        if (eventSourceRef.current === eventSource) {
          eventSource.close();
          eventSourceRef.current = null;
          setState((prev) => ({
            ...prev,
            isConnected: false,
            error: null, // 정상 종료
            isEnded: true,
          }));

          if (handlersRef.current.end) {
            const endHandler = handlersRef.current.end;
            endHandler("end" as T[string]);
          }
        }
      });

      // 각 이벤트 타입별 리스너 등록
      Object.keys(handlersRef.current).forEach((eventType) => {
        const handler = handlersRef.current[eventType as keyof T];
        if (handler) {
          eventSource.addEventListener(eventType, (event) => {
            // 여전히 현재 연결인지 확인
            if (eventSourceRef.current !== eventSource) {
              return; // 이미 새로운 연결로 교체되었으면 무시
            }

            try {
              const data = JSON.parse(event.data);
              handler(data);
            } catch (error) {
              console.error(`Failed to parse SSE data for event ${eventType}:`, error);
            }
            setState((prev) => ({
              ...prev,
              isEnded: false,
            }));
          });
        }
      });

      // 기본 message 이벤트 처리 (event 타입이 없는 경우)
      eventSource.onmessage = (event) => {
        // 여전히 현재 연결인지 확인
        if (eventSourceRef.current !== eventSource) {
          return;
        }

        try {
          const data = JSON.parse(event.data);
          // 'message' 핸들러가 있으면 호출
          const messageHandler = handlersRef.current["message" as keyof T];
          if (messageHandler) {
            messageHandler(data);
          }
        } catch (error) {
          console.error("Failed to parse SSE message:", error);
        }
      };
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        isConnected: false,
        isEnded: false,
      }));
    }
  };

  // 연결 시작
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      // cleanup
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [url, JSON.stringify(params), enabled]);

  // 파라미터가 변경되면 재연결
  useEffect(() => {
    if (enabled && eventSourceRef.current) {
      connect();
    }
  }, [JSON.stringify(params)]);

  return state;
}

/*
  Dictionary Helper
*/
export type PluralForms = {
  zero?: string | ((n: number) => string);
  one?: string | ((n: number) => string);
  other?: string | ((n: number) => string);
};

export function plural(n: number, forms: PluralForms): string {
  const form = (n === 0 && forms.zero) || (n === 1 && forms.one) || forms.other;
  return typeof form === "function" ? form(n) : (form ?? n.toString());
}

export function createFormat(locale: string) {
  return {
    number: (n: number) => n.toLocaleString(locale),
    date: (d: Date) => d.toLocaleDateString(locale),
  };
}

export function josa(word: string, type: "은는" | "이가" | "을를" | "과와" | "으로") {
  const has받침 = (() => {
    const lastChar = word.charCodeAt(word.length - 1);
    if (lastChar < 0xac00 || lastChar > 0xd7a3)
      // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
      return false;
    return (lastChar - 0xac00) % 28 !== 0;
  })();

  const map = {
    은는: has받침 ? "은" : "는",
    이가: has받침 ? "이" : "가",
    을를: has받침 ? "을" : "를",
    과와: has받침 ? "과" : "와",
    으로: has받침 ? "으로" : "로",
  };

  return word + map[type];
}
