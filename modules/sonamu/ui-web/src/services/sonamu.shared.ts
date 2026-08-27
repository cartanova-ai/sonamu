/* oxlint-disable @typescript-eslint/no-explicit-any */ // fetching 함수는 any사용

import axios, { isAxiosError, type AxiosRequestConfig } from "axios";
import { z } from "zod";

const baseURL = "";

const sonamuErrorResponseSchema = z.object({
  message: z.string(),
  issues: z.array(z.unknown()),
});

export async function fetch<T = unknown>(options: AxiosRequestConfig): Promise<T> {
  try {
    const res = await axios<T>({
      baseURL,
      ...options,
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
