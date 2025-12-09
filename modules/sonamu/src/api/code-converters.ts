/**
 * code-converters는 API 타입 정의들을 Zod 객체나 TypeScript 코드로 변환하는 함수들을 제공합니다.
 *
 * 1. API 시리즈들:
 * - ExtendedApi, ApiParam, ApiParamType
 * - API 메타데이터를 표현하는 타입 정의들
 *
 * 2. ZodObject 변환
 * - API 타입 정의 → Zod 타입 인스턴스 (런타임 밸리데이션용)
 * - getZodTypeFromApiParamType → getZodObjectFromApiParams → getZodObjectFromApi
 *
 * 3. TsTypeDef 변환
 * - API 타입 정의 → TypeScript 타입 코드 문자열 (코드 생성용)
 * - apiParamTypeToTsType → apiParamToTsCode, apiParamToTsCodeAsObject
 *
 * 참고:
 * - ZodTypeDef 생성 (Zod 코드 문자열): zod-converter.ts의 zodTypeToZodCode 사용
 * - EntityProp 변환: zod-converter.ts 참조
 */

import { z } from "zod";
import type { core } from "zod/v4";
import type { $ZodLooseShape } from "zod/v4/core";
import { type ApiParam, ApiParamType } from "../types/types";
import type { ExtendedApi } from "./decorators";

// <any>를 자제하고, Zod에서 제약하는 기본적인 Generic Type Parameter를 사용함.
type AnyZodObject = z.ZodObject<$ZodLooseShape>;
type AnyZodLiteral = z.ZodLiteral<core.util.Literal>;

/**
 * Promise 타입을 한 번 언래핑하여 내부 타입을 반환합니다.
 * Promise가 아닌 경우 원본 타입을 그대로 반환합니다.
 */
export function unwrapPromiseOnce(paramType: ApiParamType) {
  if (ApiParamType.isPromise(paramType)) {
    return paramType.args?.[0];
  } else {
    return paramType;
  }
}

/*
 * API를 구성하는 요소들을 ZodObject로 변환하기 위한 함수들입니다.
 */

/**
 * ApiParamType을 Zod 타입 인스턴스로 변환합니다.
 * string, number, array, union 등 모든 ApiParamType을 처리하며,
 * 순환참조가 발생하는 경우 z.unknown()으로 fallback합니다.
 */
export function getZodTypeFromApiParamType(
  paramType: ApiParamType,
  references: {
    [id: string]: AnyZodObject;
  },
): z.ZodType<unknown> {
  switch (paramType) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    default: {
      const advType = paramType as { t: string; value?: string | number };
      switch (advType.t) {
        case "string-literal":
        case "numeric-literal":
          return z.literal(advType.value);
        case "object": {
          const objType = paramType as { t: string; props: ApiParam[] };
          return getZodObjectFromApiParams(objType.props);
        }
        case "array": {
          const arrType = paramType as {
            t: string;
            elementsType: ApiParamType;
          };
          return z.array(getZodTypeFromApiParamType(arrType.elementsType, references));
        }
        case "ref": {
          const refType = paramType as {
            t: string;
            id: string;
            args?: ApiParamType[];
          };
          // Date 타입 처리
          if (refType.id === "Date") {
            return z.date();
          }
          // 객체 키 관리 유틸리티
          if (["Pick", "Omit"].includes(refType.id)) {
            if (refType.args?.length !== 2) {
              throw new Error(`잘못된 ${refType.id}`);
            }
            const [obj, literalOrUnion] = refType.args.map(
              (arg) => getZodTypeFromApiParamType(arg, references),
              // biome-ignore lint/suspicious/noExplicitAny: 생성되는 ZodUnion의 타입을 추적하기 어려움
            ) as [AnyZodObject, z.ZodUnion<any> | AnyZodLiteral];

            let keys: string[] = [];
            if (literalOrUnion instanceof z.ZodUnion) {
              keys = literalOrUnion.def.options.map(
                (option: { def: { values: string[] } }) => option.def.values[0],
              );
            } else {
              keys = (literalOrUnion as z.ZodLiteral<string>).def.values;
            }
            const keyRecord = Object.fromEntries(keys.map((key) => [key, true as const]));
            if (refType.id === "Pick") {
              if (obj.pick) {
                return obj.pick(keyRecord);
              }
            } else {
              if (obj.omit) {
                return obj.omit(keyRecord);
              }
            }
          }
          if (["Partial"].includes(refType.id)) {
            if (refType.args?.length !== 1) {
              throw new Error(`잘못된 ${refType.id}`);
            }
            const obj = getZodTypeFromApiParamType(refType.args[0], references);
            // biome-ignore lint/suspicious/noExplicitAny: Partial 인수 타입 캐스팅
            return (obj as z.ZodObject<any>).partial();
          }
          const reference = references[refType.id];
          if (reference === undefined) {
            return z.unknown();
            // throw new Error(`ref 참조 불가 ${refType.id}`);
          }
          return reference;
        }
        case "union": {
          const unionType = paramType as {
            t: string;
            types: ApiParamType[];
          };
          // nullable 유니온
          if (unionType.types.length === 2 && unionType.types.some((type) => type === "null")) {
            if (unionType.types[0] === "null") {
              return getZodTypeFromApiParamType(unionType.types[1], references).nullable();
            } else {
              return getZodTypeFromApiParamType(unionType.types[0], references).nullable();
            }
          }
          // 일반 유니온
          return z.union(
            unionType.types.map((type) => getZodTypeFromApiParamType(type, references)),
          );
        }
        case "intersection": {
          const intersectionType = paramType as {
            t: string;
            types: ApiParamType[];
          };
          return intersectionType.types.reduce(
            (result, type, index) => {
              const resolvedType = getZodTypeFromApiParamType(type, references);
              if (index === 0) {
                return resolvedType;
              } else {
                return z.intersection(result, resolvedType);
              }
            },
            z.unknown() as z.ZodType<unknown>,
          );
        }
        case "tuple-type": {
          const tupleType = paramType as ApiParamType.TupleType;
          return z.tuple(
            // biome-ignore lint/suspicious/noExplicitAny: 생성되는 ZodTuple의 타입을 추적하기 어려움
            tupleType.elements.map((elem) => getZodTypeFromApiParamType(elem, references)) as any,
          );
        }
      }
      return z.unknown();
    }
  }
}

/**
 * ApiParam 배열을 ZodObject로 변환합니다.
 * 각 파라미터의 optional 여부를 반영하여 Zod 스키마를 생성합니다.
 */
export function getZodObjectFromApiParams(
  apiParams: ApiParam[],
  references: {
    [id: string]: AnyZodObject;
  } = {},
): z.ZodObject {
  return z.object(
    Object.fromEntries(
      apiParams.map((param) => {
        let zodType = getZodTypeFromApiParamType(param.type, references);
        if (param.optional) {
          zodType = zodType.optional();
        }
        return [param.name, zodType];
      }),
    ),
  );
}

/**
 * ExtendedApi를 ZodObject로 변환합니다.
 * TypeParameter와 일반 파라미터를 처리하며,
 * Context, RefKnex, _로 시작하는 optional 파라미터는 제외합니다.
 */
export function getZodObjectFromApi(
  api: ExtendedApi,
  references: {
    [id: string]: AnyZodObject;
  } = {},
) {
  if (api.typeParameters?.length > 0) {
    for (const typeParam of api.typeParameters) {
      if (typeParam.constraint) {
        const zodType = getZodTypeFromApiParamType(typeParam.constraint, references);
        // biome-ignore lint/suspicious/noExplicitAny: 레퍼런스 타입 캐스팅
        (references[typeParam.id] as z.ZodType<any>) = zodType;
      }
    }
  }
  const ReqType = getZodObjectFromApiParams(
    // api parsing한 결과가 api params
    api.parameters.filter(
      (param) =>
        !ApiParamType.isContext(param.type) &&
        !ApiParamType.isRefKnex(param.type) &&
        !(param.optional === true && param.name.startsWith("_")), // _로 시작하는 파라미터는 제외
    ),
    references,
  );
  return ReqType;
}

/*
 * API 타입 정의를 TypeScript 코드 문자열로 변환하기 위한 함수들입니다.
 */

/**
 * ApiParamType을 TypeScript 타입 문자열로 변환합니다.
 * union, intersection, array, ref 등 모든 타입을 TS 문법으로 표현하며,
 * import가 필요한 타입 ID는 injectImportKeys에 수집합니다.
 */
export function apiParamTypeToTsType(paramType: ApiParamType, injectImportKeys: string[]): string {
  if (
    [
      "string",
      "number",
      "boolean",
      "true",
      "false",
      "null",
      "undefined",
      "void",
      "any",
      "unknown",
    ].includes(paramType as string)
  ) {
    return paramType as string;
  } else if (ApiParamType.isObject(paramType)) {
    return `{ ${apiParamToTsCode(paramType.props, injectImportKeys)} }`;
  } else if (ApiParamType.isStringLiteral(paramType)) {
    return `"${paramType.value}"`;
  } else if (ApiParamType.isNumericLiteral(paramType)) {
    return String(paramType.value);
  } else if (ApiParamType.isUnion(paramType)) {
    return paramType.types.map((type) => apiParamTypeToTsType(type, injectImportKeys)).join(" | ");
  } else if (ApiParamType.isIntersection(paramType)) {
    return paramType.types.map((type) => apiParamTypeToTsType(type, injectImportKeys)).join(" & ");
  } else if (ApiParamType.isArray(paramType)) {
    return `${apiParamTypeToTsType(paramType.elementsType, injectImportKeys)}[]`;
  } else if (ApiParamType.isRef(paramType)) {
    if (["Pick", "Omit", "Promise", "Partial", "Date"].includes(paramType.id) === false) {
      // importKeys 인젝션
      injectImportKeys.push(paramType.id);
    }
    if (paramType.args === undefined || paramType.args.length === 0) {
      return paramType.id;
    } else {
      return `${paramType.id}<${paramType.args
        .map((arg) => apiParamTypeToTsType(arg, injectImportKeys))
        .join(",")}>`;
    }
  } else if (ApiParamType.isIndexedAccess(paramType)) {
    return `${apiParamTypeToTsType(
      paramType.object,
      injectImportKeys,
    )}[${apiParamTypeToTsType(paramType.index, injectImportKeys)}]`;
  } else if (ApiParamType.isTupleType(paramType)) {
    return `[ ${paramType.elements.map((elem) => apiParamTypeToTsType(elem, injectImportKeys))} ]`;
  } else if (ApiParamType.isTypeParam(paramType)) {
    return `${paramType.id}${
      paramType.constraint
        ? ` extends ${apiParamTypeToTsType(paramType.constraint, injectImportKeys)}`
        : ""
    }`;
  } else {
    throw new Error(`resolve 불가 ApiParamType ${paramType}`);
  }
}

/**
 * ApiParam 배열을 TypeScript 함수 파라미터 코드로 변환합니다.
 * 예: "name: string, age?: number, active: boolean = true"
 */
export function apiParamToTsCode(params: ApiParam[], injectImportKeys: string[]): string {
  return params
    .map((param) => {
      return `${param.name}${
        param.optional && !param.defaultDef ? "?" : ""
      }: ${apiParamTypeToTsType(param.type, injectImportKeys)}${
        param.defaultDef ? `= ${param.defaultDef}` : ""
      }`;
    })
    .join(", ");
}

/**
 * ApiParam 배열을 TypeScript 객체 타입 코드로 변환합니다.
 * 예: "{ name: string, age?: number, active: boolean = true }"
 */
export function apiParamToTsCodeAsObject(params: ApiParam[], injectImportKeys: string[]): string {
  return `{ ${params
    .map(
      (param) =>
        `${param.name}${param.optional ? "?" : ""}: ${apiParamTypeToTsType(
          param.type,
          injectImportKeys,
        )}${param.defaultDef ? `= ${param.defaultDef}` : ""}`,
    )
    .join(", ")} }`;
}
