import _ from "lodash";

export type ListResult<T> = {
  rows: T[];
  total?: number;
};

export type ArrayOr<T> = T | T[];

export function asArray<T>(param: T | T[]): T[] {
  if (Array.isArray(param)) {
    return param;
  } else {
    return [param as T] as T[];
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

export class BaseListParams {
  id?: number | number[];
  num?: number;
  page?: number;
  keyword?: string;
  withoutCount?: boolean;
}
