/**
 * @generated
 * 최초 1회 생성되며, 이후에는 덮어쓰지 않습니다.
 * 필요시 직접 수정할 수 있습니다.
 */

/* oxlint-disable react-hooks/exhaustive-deps */ // shared

import { type InfiniteData } from "@tanstack/react-query";
/*
  fetch
*/
import { type AxiosRequestConfig, isAxiosError } from "axios";
import axios from "axios";
import { EventSource } from "eventsource";
import qs from "qs";
import { useCallback, useEffect, useRef, useState } from "react";
import { type core, z } from "zod";

import { getCurrentLocale } from "@/i18n/sd.generated";

type FormDataValue = string | number | boolean | bigint | null | undefined | Date | File | Blob | FormDataValue[] | FormDataFields;
interface FormDataFields {
  [key: string]: FormDataValue;
}

type QueryParamValue = string | number | boolean | null | undefined | QueryParamValue[] | QueryParams;
interface QueryParams {
  [key: string]: QueryParamValue;
}

interface SemanticQuery {
  embedding: number[];
  threshold?: number;
  method?: "cosine" | "l2" | "inner_product";
}

// ISO 8601 및 타임존 포맷의 날짜 문자열을 Date 객체로 변환하는 reviver
export function dateReviver(_key: string, value: any): any {
  if (Object.prototype.toString.call(value) === "[object String]") {
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
    if (Object.prototype.toString.call(data) === "[object String]") {
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
    if (isAxiosError(e) && e.response?.data) {
      // SAFETY: Sonamu error responses are produced by the API error handler with this payload.
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
  obj: FormDataFields,
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
    } else if (value !== null && value !== undefined && Object.prototype.toString.call(value) === "[object Object]") {
      // SAFETY: the plain-object check establishes form-data fields before recursive traversal.
      toFormData(value as FormDataFields, formData, formKey); // 재귀로 펼치기
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
type WithSimilarity<LP, T> = LP extends { semanticQuery: SemanticQuery }
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

  if (Object.prototype.toString.call(value) === "[object Number]") {
    return "integer";
  }

  if (Object.prototype.toString.call(value) === "[object Boolean]") {
    return "boolean";
  }

  // JSON 타입 (객체/배열)
  if (value !== null && Object.prototype.toString.call(value) === "[object Object]") {
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
  schema: T,
): z.ZodUnion<readonly [T, z.ZodArray<T>]> {
  return z.union([schema, schema.array()]);
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
export type WebSocketChannelOptions = {
  enabled?: boolean;
  retry?: number;
  retryInterval?: number;
  protocols?: string | string[];
  traceProvider?: () => string | undefined;
};
export type WebSocketChannelState<TSend extends object> = {
  isConnected: boolean;
  error: string | null;
  retryCount: number;
  readyState: number;
  send<K extends keyof TSend>(event: K, data: TSend[K]): void;
  close(code?: number, reason?: string): void;
};
// outbound event 전체를 강제하지 않도록 handler를 optional map으로 둠
export type EventHandlers<T> = {
  [K in keyof T]?: (data: T[K]) => void;
};

export function useSSEStream<T extends object>(
  url: string,
  params: QueryParams,
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
        // eventsource v4는 Fetch API 호환 함수 필요 (Response 객체 반환)
        // Sonamu의 axios 기반 fetch는 파싱된 데이터를 반환하므로 네이티브 fetch 사용
        fetch: (input, init) =>
          globalThis.fetch(input, {
            ...init,
            headers: {
              ...init?.headers,
              "Accept-Language": getCurrentLocale(),
            },
            credentials: "include",
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

      eventSource.addEventListener("open", () => {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          error: null,
          retryCount: 0,
          isEnded: false,
        }));
      });

      eventSource.addEventListener("error", () => {
        // 이미 다른 연결로 교체되었는지 확인
        if (eventSourceRef.current !== eventSource) {
          return; // 이미 새로운 연결이 있으면 무시
        }

        // EventSource 내장 자동 재연결 방지를 위해 즉시 close
        eventSource.close();

        setState((prev) => ({
          ...prev,
          isConnected: false,
          error: "Connection failed",
          isEnded: false,
        }));

        // 자체 재연결 로직 (EventSource 내장 재연결 대신)
        setState((prev) => {
          if (prev.retryCount < retry) {
            retryTimeoutRef.current = setTimeout(() => {
              // cleanup으로 정리되지 않았는지 확인
              if (retryTimeoutRef.current !== null) {
                setState((inner) => ({
                  ...inner,
                  retryCount: inner.retryCount + 1,
                  isEnded: false,
                }));
                connect();
              }
            }, retryInterval);
            return prev;
          } else {
            eventSourceRef.current = null;
            return {
              ...prev,
              error: `Connection failed after ${retry} attempts`,
            };
          }
        });
      });

      // 공통 'end' 이벤트 처리 (사용자 정의 이벤트와 별도)
      eventSource.addEventListener("end", () => {
        if (eventSourceRef.current === eventSource) {
          eventSource.close();
          eventSourceRef.current = null;
          setState((prev) => ({
            ...prev,
            isConnected: false,
            error: null, // 정상 종료
            isEnded: true,
          }));

          // SAFETY: "end" is the reserved generated SSE event key.
          const endHandler = handlersRef.current["end" as keyof T];
          if (endHandler) {
            // SAFETY: the reserved end event carries the literal "end" for generated SSE event maps.
            endHandler("end" as T[keyof T]);
          }
        }
      });

      // 각 이벤트 타입별 리스너 등록
      Object.keys(handlersRef.current).forEach((eventType) => {
        // SAFETY: eventType comes from Object.keys of this same handler map.
        const handler = handlersRef.current[eventType as keyof T];
        if (handler) {
          eventSource.addEventListener(eventType, (event) => {
            // 여전히 현재 연결인지 확인
            if (eventSourceRef.current !== eventSource) {
              return; // 이미 새로운 연결로 교체되었으면 무시
            }

            try {
              const data = JSON.parse(event.data, dateReviver);
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
      eventSource.addEventListener("message", (event) => {
        // 여전히 현재 연결인지 확인
        if (eventSourceRef.current !== eventSource) {
          return;
        }

        try {
          const data = JSON.parse(event.data, dateReviver);
          // 'message' 핸들러가 있으면 호출
          // SAFETY: "message" is the reserved key for untyped SSE messages.
          const messageHandler = handlersRef.current["message" as keyof T];
          if (messageHandler) {
            messageHandler(data);
          }
        } catch (error) {
          console.error("Failed to parse SSE message:", error);
        }
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Unknown error",
        isConnected: false,
        isEnded: false,
      }));
    }
  };

  // 연결 시작 (단일 effect로 연결 lifecycle 관리)
  useEffect(() => {
    if (enabled) {
      // state 초기화
      setState({
        isConnected: false,
        error: null,
        retryCount: 0,
        isEnded: false,
      });
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

  return state;
}

export function useWebSocketChannel<
  TReceive extends object,
  TSend extends object,
>(
  url: string,
  params: QueryParams,
  handlers: EventHandlers<TReceive>,
  options: WebSocketChannelOptions = {},
): WebSocketChannelState<TSend> {
  const { enabled = true, retry = 3, retryInterval = 3000, protocols, traceProvider } = options;

  const [state, setState] = useState<Omit<WebSocketChannelState<TSend>, "send" | "close">>({
    isConnected: false,
    error: null,
    retryCount: 0,
    readyState: 3,
  });

  const socketRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef(handlers);
  const manualCloseRef = useRef(false);
  // 최신 연결 식별자를 따로 두어 stale socket 이벤트가 상태를 덮지 못하게 함
  const connectionIdRef = useRef(0);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const close = (code?: number, reason?: string) => {
    manualCloseRef.current = true;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.close(code, reason);
    }
  };

  const send = <K extends keyof TSend>(event: K, data: TSend[K]) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setState((prev) => ({
        ...prev,
        error: "WebSocket is not connected",
      }));
      return;
    }

    const traceparent = traceProvider?.();
    if (traceparent) {
      socket.send(JSON.stringify({ event, data, meta: { traceparent } }));
      return;
    }
    socket.send(JSON.stringify({ event, data }));
  };

  const connect = () => {
    if (!enabled) {
      return;
    }

    const connectionId = ++connectionIdRef.current;
    manualCloseRef.current = false;

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    const fullUrl = resolveWebSocketUrl(url, params);
    const socket = new WebSocket(fullUrl, protocols);
    socketRef.current = socket;

    setState((prev) => ({
      ...prev,
      isConnected: false,
      error: null,
      readyState: socket.readyState,
    }));

    // socketRef.current !== socket 가드는 이전 연결의 늦은 콜백을 무시하기 위한 장치임
    socket.addEventListener("open", () => {
      if (socketRef.current !== socket) {
        return;
      }

      setState((prev) => ({
        ...prev,
        isConnected: true,
        error: null,
        retryCount: 0,
        readyState: socket.readyState,
      }));
    });

    socket.addEventListener("message", (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      try {
        // SAFETY: the WebSocket service serializes event envelopes with the registered event map.
        const payload = JSON.parse(event.data, dateReviver) as {
          event: keyof TReceive;
          data: TReceive[keyof TReceive];
        };
        const handler = handlersRef.current[payload.event];
        if (handler) {
          handler(payload.data);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    });

    socket.addEventListener("error", () => {
      if (socketRef.current !== socket) {
        return;
      }

      setState((prev) => ({
        ...prev,
        isConnected: false,
        error: "WebSocket connection failed",
        readyState: socket.readyState,
      }));
    });

    socket.addEventListener("close", (event) => {
      if (socketRef.current !== socket) {
        return;
      }

      socketRef.current = null;

      setState((prev) => ({
        ...prev,
        isConnected: false,
        readyState: socket.readyState,
      }));

      if (manualCloseRef.current || connectionIdRef.current !== connectionId) {
        return;
      }

      // 정책 위반/과대 payload close는 재시도보다 명시적 에러 노출이 우선임
      if (!isRetryableWebSocketCloseCode(event.code)) {
        setState((prev) => ({
          ...prev,
          error:
            event.code === 1008 || event.code === 1009
              ? `WebSocket rejected by server (code: ${event.code})`
              : `WebSocket closed (code: ${event.code})`,
        }));
        return;
      }

      setState((prev) => {
        if (prev.retryCount >= retry) {
          return {
            ...prev,
            error: `Connection failed after ${retry} attempts`,
          };
        }

        retryTimeoutRef.current = setTimeout(() => {
          if (connectionIdRef.current !== connectionId) {
            return;
          }

          setState((inner) => ({
            ...inner,
            retryCount: inner.retryCount + 1,
          }));
          connect();
        }, retryInterval);

        return prev;
      });
    });
  };

  useEffect(() => {
    if (enabled) {
      setState({
        isConnected: false,
        error: null,
        retryCount: 0,
        readyState: 3,
      });
      connect();
    }

    return () => {
      connectionIdRef.current += 1;
      manualCloseRef.current = true;
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [url, JSON.stringify(params), enabled, JSON.stringify(protocols)]);

  return {
    ...state,
    send,
    close,
  };
}

function isRetryableWebSocketCloseCode(code: number): boolean {
  if (code === 1000) {
    return false;
  }

  return ![1002, 1003, 1007, 1008, 1009].includes(code);
}

function resolveWebSocketUrl(url: string, params: QueryParams): string {
  const queryString = qs.stringify(params);
  const withQuery = queryString ? `${url}?${queryString}` : url;

  if (withQuery.startsWith("ws://") || withQuery.startsWith("wss://")) {
    return withQuery;
  }

  const baseUrl = resolveWebSocketBaseUrl();
  return new URL(withQuery, baseUrl).toString();
}

function resolveWebSocketBaseUrl(): string {
  const configuredBaseUrl = axios.defaults.baseURL;
  // HTTP client와 WS client가 다른 origin으로 갈라지지 않게 axios baseURL을 우선 존중함
  if (configuredBaseUrl) {
    const absoluteBaseUrl =
      globalThis.window
        ? new URL(configuredBaseUrl, window.location.origin).toString()
        : configuredBaseUrl;
    return toWebSocketBaseUrl(absoluteBaseUrl);
  }

  if (globalThis.window) {
    return toWebSocketBaseUrl(window.location.origin);
  }

  return toWebSocketBaseUrl("http://localhost:10280");
}

function toWebSocketBaseUrl(baseUrl: string): string {
  if (baseUrl.startsWith("ws://") || baseUrl.startsWith("wss://")) {
    return baseUrl;
  }

  return baseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

/*
  Dictionary Helper
*/
export type PluralForms = {
  zero?: string | ((n: number) => string);
  one?: string | ((n: number) => string);
  other?: string | ((n: number) => string);
};

function isPluralFunction(form: PluralForms["other"]): form is (n: number) => string {
  return Object.prototype.toString.call(form) === "[object Function]";
}

export function plural(n: number, forms: PluralForms): string {
  const form = (n === 0 && forms.zero) || (n === 1 && forms.one) || forms.other;
  return isPluralFunction(form) ? form(n) : (form ?? n.toString());
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

/*
  Query helpers
*/
type InfinitePage<TRow> = { rows: TRow[]; total: number };
type DedupedInfiniteData<TRow> = InfiniteData<InfinitePage<TRow>> & {
  rows: TRow[];
  total: number;
};

// useInfiniteQuery의 select에 꽂아 pages/pageParams 원본은 유지하면서
// 평탄화된 rows와 첫 페이지의 total을 data에 함께 노출합니다.
// 각 row가 id를 갖는 경우 id 기준으로 중복 제거합니다. id가 없으면 그대로 유지합니다.
export function dedupeAndFlatten<TRow extends { id?: unknown }>(
  data: InfiniteData<InfinitePage<TRow>>,
): DedupedInfiniteData<TRow> {
  const seen = new Set<unknown>();
  const rows: TRow[] = [];
  for (const page of data.pages) {
    for (const row of page?.rows ?? []) {
      const id = row?.id;
      if (id !== null) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
      }
      rows.push(row);
    }
  }
  const total = data.pages[0]?.total ?? 0;
  return {
    pages: data.pages,
    pageParams: data.pageParams,
    rows,
    total,
  };
}

// TanStack Query 결과에 수동 refresh 진입점과 새로고침 중 상태를 덧붙여 줍니다.
// isRefreshing은 query.isFetching과 독립적으로 이 함수 호출로 발생한 새로고침에 한정됩니다.
export function useRefreshable<T extends { refetch: () => Promise<object | void> }>(
  query: T,
): T & { refresh: () => Promise<void>; isRefreshing: boolean } {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [query]);
  return { ...query, refresh, isRefreshing };
}
