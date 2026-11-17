/* oxlint-disable @typescript-eslint/no-explicit-any */ // fetching 함수는 any사용

import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import { z } from "zod";

import { sonamuUITokenHeaders } from "./sonamu-ui-token";

const baseURL = "";

// 모든 Sonamu UI API 요청에 접근 토큰을 붙이는 전용 인스턴스입니다.
const sonamuUIAxios = axios.create({ headers: sonamuUITokenHeaders() });

const sonamuErrorResponseSchema = z.object({
  message: z.string(),
  issues: z.array(z.unknown()),
});

export async function fetch<T = unknown>(options: AxiosRequestConfig): Promise<T> {
  try {
    const res = await sonamuUIAxios<T>({
      baseURL,
      ...options,
      // 서버는 이 헤더가 있는 동일 출처 요청만 프로세스 실행 API로 받습니다.
      headers: { "X-Sonamu-UI": "1", ...options.headers },
    });
    return res.data;
  } catch (e: unknown) {
    if (isAxiosError(e) && e.response && e.response.data) {
      const parsed = sonamuErrorResponseSchema.safeParse(e.response.data);
      if (parsed.success) {
        throw new SonamuError(e.response.status, parsed.data.message, parsed.data.issues);
      }
    }
    throw e;
  }
}

export class SonamuError extends Error {
  isSonamuError: boolean;

  constructor(
    public code: number,
    public message: string,
    public issues: unknown[],
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
