import { type SonamuQueryMode, type SonamuSemanticParams } from "../types/types";

// semanticQuery가 있으면 similarity를 추가하는 조건부 타입
type WithSimilarity<LP, T> = "semanticQuery" extends keyof LP ? T & { similarity: number } : T;

export type ListResult<
  LP extends { queryMode?: SonamuQueryMode },
  T,
> = LP["queryMode"] extends "list"
  ? { rows: WithSimilarity<LP, T>[] }
  : LP["queryMode"] extends "count"
    ? { total: number }
    : { rows: WithSimilarity<LP, T>[]; total: number };

export type ArrayOr<T> = T | T[];

export function asArray<T>(param: T | T[]): T[] {
  if (Array.isArray(param)) {
    return param;
  } else {
    // SAFETY: 선행 분기와 함수 계약이 이 타입을 보장합니다.
    return [param] as T[];
  }
}

export function objToMap<T>(obj: { [k: string]: T }) {
  const keys = Object.keys(obj);
  if (keys.every((key) => parseInt(key).toString() === key)) {
    return new Map<number, T>(keys.map((key) => [parseInt(key), obj[key]]));
  } else {
    return new Map<string, T>(Object.entries(obj));
  }
}

export interface BaseListParams {
  id?: number | number[];
  num?: number;
  page?: number;
  keyword?: string;
  queryMode?: "list" | "count" | "both";
  semanticQuery?: SonamuSemanticParams["semanticQuery"];
}
