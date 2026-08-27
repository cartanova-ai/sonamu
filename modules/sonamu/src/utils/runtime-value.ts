function hasPrimitiveTag<Value>(value: Value, tag: string): boolean {
  return Object.prototype.toString.call(value) === tag && Object(value) !== value;
}

/** 런타임 값이 원시 문자열인지 판별합니다. */
export function isStringValue<Value>(value: Value): value is Value & string {
  return hasPrimitiveTag(value, "[object String]");
}

/** 런타임 값이 원시 숫자인지 판별합니다. */
export function isNumberValue<Value>(value: Value): value is Value & number {
  return hasPrimitiveTag(value, "[object Number]");
}

/** 런타임 값이 원시 심벌인지 판별합니다. */
export function isSymbolValue<Value>(value: Value): value is Value & symbol {
  return hasPrimitiveTag(value, "[object Symbol]");
}

/** 런타임 값이 원시 bigint인지 판별합니다. */
export function isBigIntValue<Value>(value: Value): value is Value & bigint {
  return hasPrimitiveTag(value, "[object BigInt]");
}

/** 런타임 값이 함수인지 판별합니다. */
export function isFunctionValue<Value>(value: Value): value is Value & CallableFunction {
  try {
    const tag = Object.prototype.toString.call(value);
    return (
      tag === "[object Function]" ||
      tag === "[object AsyncFunction]" ||
      tag === "[object GeneratorFunction]" ||
      tag === "[object AsyncGeneratorFunction]"
    );
  } catch {
    return false;
  }
}

/** null과 함수를 제외한 객체 표현인지 판별합니다. */
export function isObjectValue<Value>(value: Value): value is Value & object {
  return value !== null && Object(value) === value && !isFunctionValue(value);
}
