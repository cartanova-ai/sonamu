/*
  fetch
*/
import type { AxiosRequestConfig } from "axios";
import axios from "axios";
import { z, ZodIssue } from "zod";
import qs from "qs";

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
        issues: ZodIssue[];
      };
      throw new SonamuError(e.response.status, d.message, d.issues);
    }
    throw e;
  }
}

export class SonamuError extends Error {
  isSonamuError: boolean;

  constructor(
    public code: number,
    public message: string,
    public issues: z.ZodIssue[]
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
export type ListResult<T> = {
  rows: T[];
  total?: number;
};
export const SonamuQueryMode = z.enum(["both", "list", "count"]);
export type SonamuQueryMode = z.infer<typeof SonamuQueryMode>;

/*
  SWR
*/
export type SwrOptions = {
  conditional?: () => boolean;
};
export type SWRError = {
  name: string;
  message: string;
  statusCode: number;
};
export async function swrFetcher(args: [string, object]): Promise<any> {
  try {
    const [url, params] = args;
    const res = await axios.get(`${url}?${qs.stringify(params)}`);
    return res.data;
  } catch (e: any) {
    const error: any = new Error(
      e.response.data.message ?? e.response.message ?? "Unknown"
    );
    error.statusCode = e.response?.data.statusCode ?? e.response.status;
    throw error;
  }
}
export async function swrPostFetcher(args: [string, object]): Promise<any> {
  try {
    const [url, params] = args;
    const res = await axios.post(url, params);
    return res.data;
  } catch (e: any) {
    const error: any = new Error(
      e.response.data.message ?? e.response.message ?? "Unknown"
    );
    error.statusCode = e.response?.data.statusCode ?? e.response.status;
    throw error;
  }
}
export function handleConditional(
  args: [string, object],
  conditional?: () => boolean
): [string, object] | null {
  if (conditional) {
    return conditional() ? args : null;
  }
  return args;
}

/*
  Utils
*/
export function zArrayable<T extends z.ZodTypeAny>(
  shape: T
): z.ZodUnion<[T, z.ZodArray<T, "many">]> {
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
  options: SSEStreamOptions = {}
): SSEStreamState {
  const { enabled = true, retry = 3, retryInterval = 3000 } = options;

  const [state, setState] = useState<SSEStreamState>({
    isConnected: false,
    error: null,
    retryCount: 0,
    isEnded: false,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

      const eventSource = new EventSource(fullUrl);
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

      eventSource.onerror = (event) => {
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
              console.error(
                `Failed to parse SSE data for event ${eventType}:`,
                error
              );
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
