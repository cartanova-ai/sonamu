import axios, { AxiosRequestConfig } from "axios";
import qs from "qs";
import { ZodIssue } from "zod";

const baseURL = "http://localhost:57001";

export async function fetch(options: AxiosRequestConfig) {
  try {
    const res = await axios({
      baseURL,
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

export async function swrFetcher(args: [string, object]): Promise<any> {
  try {
    const [url, params] = args;
    const res = await axios.get(`${baseURL}${url}?${qs.stringify(params)}`);
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
    const res = await axios.post(`${baseURL}${url}`, params);
    return res.data;
  } catch (e: any) {
    const error: any = new Error(
      e.response.data.message ?? e.response.message ?? "Unknown"
    );
    error.statusCode = e.response?.data.statusCode ?? e.response.status;
    throw error;
  }
}

export class SonamuError extends Error {
  isSonamuError: boolean;

  constructor(
    public code: number,
    public message: string,
    public issues: ZodIssue[]
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
