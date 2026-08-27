import {
  isBigIntValue,
  isFunctionValue,
  isNumberValue,
  isStringValue,
  isSymbolValue,
} from "./utils/runtime-value";

export type RuntimeType =
  | "bigint"
  | "boolean"
  | "function"
  | "number"
  | "object"
  | "string"
  | "symbol"
  | "undefined";

/** 런타임 값이 불리언인지 판별합니다. */
export function isBooleanValue<Value>(value: Value): value is Value & boolean {
  return value === true || value === false;
}

/** JavaScript의 typeof 결과를 단항 연산자 없이 동일하게 계산합니다. */
export function runtimeTypeOf<Value>(value: Value): RuntimeType {
  if (value === undefined) return "undefined";
  if (isStringValue(value)) return "string";
  if (isNumberValue(value)) return "number";
  if (isBooleanValue(value)) return "boolean";
  if (isBigIntValue(value)) return "bigint";
  if (isSymbolValue(value)) return "symbol";
  if (isFunctionValue(value)) return "function";
  return "object";
}
