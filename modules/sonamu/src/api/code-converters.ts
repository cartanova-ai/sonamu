import { z } from "zod";
import type { core } from "zod/v4";
import type { $ZodLooseShape } from "zod/v4/core";
import { Naite } from "../naite/naite";
import {
  type ApiParam,
  ApiParamType,
  type EntityProp,
  type EntityPropNode,
  isBelongsToOneRelationProp,
  isBigIntegerProp,
  isBooleanProp,
  isDateProp,
  isDateTimeProp,
  isDecimalProp,
  isDoubleProp,
  isEnumProp,
  isFloatProp,
  isIntegerProp,
  isJsonProp,
  isOneToOneRelationProp,
  isRelationProp,
  isStringProp,
  isTextProp,
  isTimeProp,
  isTimestampProp,
  isUuidProp,
  isVirtualProp,
  type TextProp,
} from "../types/types";
import type { ExtendedApi } from "./decorators";

// <any>를 자제하고, Zod에서 제약하는 기본적인 Generic Type Parameter를 사용함.
type AnyZodRecord = z.ZodRecord<z.ZodString | z.ZodNumber | z.ZodSymbol, z.ZodType>;
type AnyZodObject = z.ZodObject<$ZodLooseShape>;
type AnyZodArray = z.ZodArray<z.ZodType>;
type AnyZodNullable = z.ZodNullable<z.ZodType>;
type AnyZodOptional = z.ZodOptional<z.ZodType>;
type AnyZodDefault = z.ZodDefault<z.ZodType>;
type AnyZodLiteral = z.ZodLiteral<core.util.Literal>;
type AnyZodUnion = z.ZodUnion<z.ZodType[]>;

/*
  ExtendedApi 에서 ZodObject 리턴
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

  Naite.t(
    "ApiParamType",
    api.parameters[0]
      ?.type /*file.model.ts의 upload 메소드 같은 경우는 파라미터가 0개라서 api.parameters[0]가 undefined로 나옵니다. 이에 대응하기 위해 ?. 연산자를 사용합니다.*/,
  );

  return ReqType;
}

/*
  ZodObject를 통해 ApiParam 리턴
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

/*
  ApiParamType으로 ZodType 컨버팅
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
            return z.string();
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

export function propNodeToZodTypeDef(propNode: EntityPropNode, injectImportKeys: string[]): string {
  if (propNode.nodeType === "plain") {
    return propToZodTypeDef(propNode.prop, injectImportKeys);
  } else if (propNode.nodeType === "array") {
    return [
      propNode.prop ? `${propNode.prop.name}: ` : "",
      "z.array(z.object({",
      propNode.children
        .map((childPropNode) => propNodeToZodTypeDef(childPropNode, injectImportKeys))
        .join("\n"),
      "",
      "})),",
    ].join("\n");
  } else if (propNode.nodeType === "object") {
    return [
      propNode.prop ? `${propNode.prop.name}: ` : "",
      "z.object({",
      propNode.children
        .map((childPropNode) => propNodeToZodTypeDef(childPropNode, injectImportKeys))
        .join("\n"),
      "",
      `})${propNode.prop?.nullable ? ".nullable()" : ""},`,
    ].join("\n");
  } else {
    throw Error;
  }
}

export function getTextTypeLength(textType: TextProp["textType"]): number {
  switch (textType) {
    case "text":
      return 1024 * 64 - 1;
    case "mediumtext":
      return 1024 * 1024 * 16 - 1;
    case "longtext":
      return 1024 * 1024 * 1024 * 4 - 1;
  }
}

export function propToZodTypeDef(prop: EntityProp, injectImportKeys: string[]): string {
  let stmt: string;
  if (isIntegerProp(prop)) {
    stmt = `${prop.name}: z.int()`;
  } else if (isBigIntegerProp(prop)) {
    stmt = `${prop.name}: z.bigint()`;
  } else if (isTextProp(prop)) {
    stmt = `${prop.name}: z.string().max(${getTextTypeLength(prop.textType)})`;
  } else if (isEnumProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isStringProp(prop)) {
    stmt = `${prop.name}: z.string().max(${prop.length})`;
  } else if (isDecimalProp(prop)) {
    stmt = `${prop.name}: z.string()`;
  } else if (isFloatProp(prop) || isDoubleProp(prop)) {
    stmt = `${prop.name}: z.number()`;
  } else if (isBooleanProp(prop)) {
    stmt = `${prop.name}: z.boolean()`;
  } else if (isDateProp(prop)) {
    stmt = `${prop.name}: z.string().length(10)`;
  } else if (isTimeProp(prop)) {
    stmt = `${prop.name}: z.string().length(8)`;
  } else if (isDateTimeProp(prop)) {
    stmt = `${prop.name}: z.date()`;
  } else if (isTimestampProp(prop)) {
    stmt = `${prop.name}: z.date()`;
  } else if (isJsonProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isUuidProp(prop)) {
    stmt = `${prop.name}: z.uuid()`;
  } else if (isVirtualProp(prop)) {
    stmt = `${prop.name}: ${prop.id}`;
    injectImportKeys.push(prop.id);
  } else if (isRelationProp(prop)) {
    if (isBelongsToOneRelationProp(prop) || (isOneToOneRelationProp(prop) && prop.hasJoinColumn)) {
      stmt = `${prop.name}_id: z.int()`;
    } else {
      // 그외 relation 케이스 제외
      return `// ${prop.name}: ${prop.relationType} ${prop.with}`;
    }
  } else {
    return "// unable to resolve";
  }

  if ((prop as { unsigned?: boolean }).unsigned) {
    stmt += ".nonnegative()";
  }
  if (prop.nullable) {
    stmt += ".nullable()";
  }

  return `${stmt},`;
}

// TODO(Haze, 251031): "template_literal", "file"에 대한 지원이 필요함.
export function zodTypeToZodCode(zt: z.ZodType): string {
  switch (zt.def.type) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "bigint":
      return "z.bigint()";
    case "boolean":
      return "z.boolean()";
    case "date":
      return "z.date()";
    case "null":
      return "z.null()";
    case "undefined":
      return "z.undefined()";
    case "any":
      return "z.any()";
    case "unknown":
      return "z.unknown()";
    case "never":
      return "z.never()";
    case "nullable":
      return `${zodTypeToZodCode((zt as AnyZodNullable).def.innerType)}.nullable()`;
    case "default": {
      const zDefaultDef = (zt as AnyZodDefault).def;
      return `${zodTypeToZodCode(zDefaultDef.innerType)}.default(${zDefaultDef.defaultValue})`;
    }
    case "record": {
      const zRecordDef = (zt as AnyZodRecord).def;
      return `z.record(${zodTypeToZodCode(zRecordDef.keyType)}, ${zodTypeToZodCode(
        zRecordDef.valueType,
      )})`;
    }
    case "literal": {
      const items = Array.from((zt as z.ZodLiteral<string | number>).values).map((value) => {
        if (typeof value === "string") {
          return `"${value}"`;
        }

        if (value === null) {
          return `null`;
        }

        if (value === undefined) {
          return `undefined`;
        }

        return `${value}`;
      });

      if (items.length === 1) {
        return `z.literal(${items[0]})`;
      }
      return `z.literal([${items.join(", ")}])`;
    }
    case "union":
      return `z.union([${(zt as AnyZodUnion).def.options
        .map((option: z.ZodType) => zodTypeToZodCode(option))
        .join(",")}])`;
    case "enum":
      // NOTE: z.enum(["A", "B"])도 z.enum({ A: "A", B: "B" })로 처리됨.
      return `z.enum({${Object.entries((zt as z.ZodEnum).def.entries)
        .map(([key, val]) => (typeof val === "string" ? `${key}: "${val}"` : `${key}: ${val}`))
        .join(", ")}})`;
    case "array":
      return `z.array(${zodTypeToZodCode((zt as z.ZodArray<z.ZodType>).def.element)})`;
    case "object": {
      const shape = (zt as AnyZodObject).shape;
      return [
        "z.object({",
        ...Object.keys(shape).map((key) => `${key}: ${zodTypeToZodCode(shape[key])},`),
        "})",
      ].join("\n");
    }
    case "optional":
      return `${zodTypeToZodCode((zt as z.ZodOptional<z.ZodType>).def.innerType)}.optional()`;
    case "file":
      return `z.file()`;
    case "intersection": {
      const zIntersectionDef = (zt as z.ZodIntersection<z.ZodType, z.ZodType>).def;
      return `z.intersection(${zodTypeToZodCode(zIntersectionDef.left)}, ${zodTypeToZodCode(zIntersectionDef.right)})`;
    }
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
  }
}

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
    return `<${paramType.id}${
      paramType.constraint
        ? ` extends ${apiParamTypeToTsType(paramType.constraint, injectImportKeys)}`
        : ""
    }>`;
  } else {
    throw new Error(`resolve 불가 ApiParamType ${paramType}`);
  }
}

export function unwrapPromiseOnce(paramType: ApiParamType) {
  if (ApiParamType.isPromise(paramType)) {
    return paramType.args?.[0];
  } else {
    return paramType;
  }
}

// TODO(Haze, 251031): "template_literal", "file"에 대한 지원이 필요함.
export function zodTypeToTsTypeDef(zt: z.ZodType): string {
  switch (zt.def.type) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "date":
    case "null":
    case "undefined":
    case "any":
    case "unknown":
    case "never":
      return zt.def.type;
    case "nullable":
      return `${zodTypeToTsTypeDef((zt as AnyZodNullable).def.innerType)} | null`;
    case "default":
      return zodTypeToTsTypeDef((zt as AnyZodDefault).def.innerType);
    case "record": {
      const recordType = zt as AnyZodRecord;
      return `{ [ key: ${zodTypeToTsTypeDef(recordType.def.keyType)} ]: ${zodTypeToTsTypeDef(recordType.def.valueType)}}`;
    }
    case "literal":
      return Array.from((zt as z.ZodLiteral).values)
        .map((value) => {
          if (typeof value === "string") {
            return `"${value}"`;
          }

          if (value === null) {
            return `null`;
          }

          if (value === undefined) {
            return `undefined`;
          }

          return `${value}`;
        })
        .join(" | ");
    case "union":
      return `${(zt as AnyZodUnion).options
        .map((option) => zodTypeToTsTypeDef(option))
        .join(" | ")}`;
    case "enum":
      return `${(zt as z.ZodEnum).options.map((val) => `"${val}"`).join(" | ")}`;
    case "array":
      return `${zodTypeToTsTypeDef((zt as AnyZodArray).element)}[]`;
    case "object": {
      const shape = (zt as AnyZodObject).shape;
      return [
        "{",
        ...Object.keys(shape).map((key) => {
          if (shape[key].def.type === "optional") {
            return `${key}?: ${zodTypeToTsTypeDef(shape[key].def.innerType)},`;
          } else {
            return `${key}: ${zodTypeToTsTypeDef(shape[key])},`;
          }
        }),
        "}",
      ].join("\n");
    }
    case "optional":
      return `${zodTypeToTsTypeDef((zt as AnyZodOptional).def.innerType)} | undefined`;
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
  }
}
