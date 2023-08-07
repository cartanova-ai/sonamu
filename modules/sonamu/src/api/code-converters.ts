import { z, ZodRecord } from "zod";
import {
  ApiParam,
  ApiParamType,
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
  SMDProp,
  SMDPropNode,
  TextProp,
} from "../types/types";
import { ExtendedApi } from "./decorators";

/*
  ExtendedApi 에서 ZodObject 리턴
*/
export function getZodObjectFromApi(
  api: ExtendedApi,
  references: {
    [id: string]: z.ZodObject<any>;
  } = {}
) {
  if (api.typeParameters?.length > 0) {
    api.typeParameters.map((typeParam) => {
      if (typeParam.constraint) {
        let zodType = getZodTypeFromApiParamType(
          typeParam.constraint,
          references
        );
        (references[typeParam.id] as any) = zodType;
      }
    });
  }

  const ReqType = getZodObjectFromApiParams(
    api.parameters.filter((param) => !ApiParamType.isContext(param.type)),
    references
  );
  return ReqType;
}

/*
  ZodObject를 통해 ApiParam 리턴
*/
export function getZodObjectFromApiParams(
  apiParams: ApiParam[],
  references: {
    [id: string]: z.ZodObject<any>;
  } = {}
): z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}> {
  return z.object(
    apiParams.reduce((r, param) => {
      let zodType = getZodTypeFromApiParamType(param.type, references);
      if (param.optional) {
        zodType = zodType.optional();
      }
      return {
        ...r,
        [param.name]: zodType,
      };
    }, {})
  );
}

/*
  ApiParamType으로 ZodType 컨버팅
*/
export function getZodTypeFromApiParamType(
  paramType: ApiParamType,
  references: {
    [id: string]: z.ZodObject<any>;
  }
): z.ZodType<unknown> {
  switch (paramType) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    default:
      const advType = paramType as { t: string };
      switch (advType.t) {
        case "string-literal":
        case "numeric-literal":
          return z.literal((advType as any).value);
        case "object":
          const objType = paramType as { t: string; props: ApiParam[] };
          return getZodObjectFromApiParams(objType.props);
        case "array":
          const arrType = paramType as {
            t: string;
            elementsType: ApiParamType;
          };
          return z.array(
            getZodTypeFromApiParamType(arrType.elementsType, references)
          );
        case "ref":
          const refType = paramType as {
            t: string;
            id: string;
            args?: ApiParamType[];
          };

          // 객체 키 관리 유틸리티
          if (["Pick", "Omit"].includes(refType.id)) {
            if (refType.args?.length !== 2) {
              throw new Error(`잘못된 ${refType.id}`);
            }
            const [obj, literalOrUnion] = refType.args!.map((arg) =>
              getZodTypeFromApiParamType(arg, references)
            ) as [z.ZodObject<any>, z.ZodUnion<any> | z.ZodLiteral<string>];
            let keys: string[] = [];
            if (literalOrUnion instanceof z.ZodUnion) {
              keys = literalOrUnion._def.options.map(
                (option: { _def: { value: string } }) => option._def.value
              );
            } else {
              keys = [(literalOrUnion as z.ZodLiteral<string>)._def.value];
            }
            const keyRecord = keys.reduce((result, key) => {
              return {
                ...result,
                [key]: true,
              };
            }, {} as any);

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
            return (obj as any).partial();
          }

          const reference = references[refType.id];
          if (reference === undefined) {
            return z.string();
            // throw new Error(`ref 참조 불가 ${refType.id}`);
          }
          return reference;
        case "union":
          const unionType = paramType as {
            t: string;
            types: ApiParamType[];
          };
          return z.union(
            unionType.types.map((type) =>
              getZodTypeFromApiParamType(type, references)
            ) as any
          );
        case "intersection":
          const intersectionType = paramType as {
            t: string;
            types: ApiParamType[];
          };
          return intersectionType.types.reduce((result, type, index) => {
            const resolvedType = getZodTypeFromApiParamType(type, references);
            if (index === 0) {
              return resolvedType;
            } else {
              return z.intersection(result as any, resolvedType);
            }
          }, z.unknown() as any) as any;
        case "tuple-type":
          const tupleType = paramType as ApiParamType.TupleType;
          return z.tuple(
            tupleType.elements.map((elem) =>
              getZodTypeFromApiParamType(elem, references)
            ) as any
          );
      }
      return z.unknown();
  }
}

export function propNodeToZodTypeDef(
  propNode: SMDPropNode,
  injectImportKeys: string[]
): string {
  if (propNode.nodeType === "plain") {
    return propToZodTypeDef(propNode.prop, injectImportKeys);
  } else if (propNode.nodeType === "array") {
    return [
      propNode.prop ? `${propNode.prop.name}: ` : "",
      "z.array(z.object({",
      propNode.children
        .map((childPropNode) =>
          propNodeToZodTypeDef(childPropNode, injectImportKeys)
        )
        .join("\n"),
      "",
      "})),",
    ].join("\n");
  } else if (propNode.nodeType === "object") {
    return [
      propNode.prop ? `${propNode.prop.name}: ` : "",
      "z.object({",
      propNode.children
        .map((childPropNode) =>
          propNodeToZodTypeDef(childPropNode, injectImportKeys)
        )
        .join("\n"),
      "",
      "}),",
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

export function propToZodTypeDef(
  prop: SMDProp,
  injectImportKeys: string[]
): string {
  let stmt: string;
  if (isIntegerProp(prop)) {
    stmt = `${prop.name}: z.number().int()`;
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
    stmt = `${prop.name}: SQLDateTimeString`;
  } else if (isTimestampProp(prop)) {
    stmt = `${prop.name}: SQLDateTimeString`;
  } else if (isJsonProp(prop)) {
    if (prop.as instanceof z.ZodType) {
      stmt = `${prop.name}: ${zodTypeToZodCode(prop.as)}`;
    } else {
      stmt = `${prop.name}: ${prop.as.ref}`;
      injectImportKeys.push(prop.as.ref);
    }
  } else if (isUuidProp(prop)) {
    stmt = `${prop.name}: z.string().uuid()`;
  } else if (isVirtualProp(prop)) {
    if (prop.as instanceof z.ZodType) {
      stmt = `${prop.name}: ${zodTypeToZodCode(prop.as)}`;
    } else {
      stmt = `${prop.name}: ${prop.as.ref}`;
      injectImportKeys.push(prop.as.ref);
    }
  } else if (isRelationProp(prop)) {
    if (
      isBelongsToOneRelationProp(prop) ||
      (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
    ) {
      stmt = `${prop.name}_id: z.number().int()`;
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

  return stmt + ",";
}

export function zodTypeToZodCode(
  zt: z.ZodFirstPartySchemaTypes | z.ZodObject<any>
): string {
  switch (zt._def.typeName) {
    case "ZodString":
      return "z.string()";
    case "ZodNumber":
      return "z.number()";
    case "ZodBoolean":
      return "z.boolean()";
    case "ZodBigInt":
      return "z.bigint()";
    case "ZodDate":
      return "z.date()";
    case "ZodNull":
      return "z.null()";
    case "ZodUndefined":
      return "z.undefined()";
    case "ZodAny":
      return "z.any()";
    case "ZodUnknown":
      return "z.unknown()";
    case "ZodNever":
      return "z.never()";
    case "ZodNullable":
      return zodTypeToZodCode(zt._def.innerType) + ".nullable()";
    case "ZodDefault":
      return (
        zodTypeToZodCode(zt._def.innerType) +
        `.default(${zt._def.defaultValue()})`
      );
    case "ZodRecord":
      return `z.record(${zodTypeToZodCode(zt._def.keyType)}, ${zodTypeToZodCode(
        zt._def.valueType
      )})`;
    case "ZodLiteral":
      if (typeof zt._def.value === "string") {
        return `z.literal("${zt._def.value}")`;
      } else {
        return `z.literal(${zt._def.value})`;
      }
    case "ZodUnion":
      return `z.union([${zt._def.options
        .map((option: z.ZodTypeAny) => zodTypeToZodCode(option))
        .join(",")}])`;
    case "ZodEnum":
      return `z.enum([${zt._def.values
        .map((val: string) => `"${val}"`)
        .join(", ")}])`;
    case "ZodArray":
      return `z.array(${zodTypeToZodCode(zt._def.type)})`;
    case "ZodObject":
      const shape = (zt as any).shape;
      return [
        "z.object({",
        ...Object.keys(shape).map(
          (key) => `${key}: ${zodTypeToZodCode(shape[key])},`
        ),
        "})",
      ].join("\n");
    case "ZodOptional":
      return zodTypeToZodCode(zt._def.innerType) + ".optional()";
    default:
      throw new Error(`처리되지 않은 ZodType ${zt._def.typeName}`);
  }
}

export function apiParamToTsCode(
  params: ApiParam[],
  injectImportKeys: string[]
): string {
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

export function apiParamTypeToTsType(
  paramType: ApiParamType,
  injectImportKeys: string[]
): string {
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
    return paramType.types
      .map((type) => apiParamTypeToTsType(type, injectImportKeys))
      .join(" | ");
  } else if (ApiParamType.isIntersection(paramType)) {
    return paramType.types
      .map((type) => apiParamTypeToTsType(type, injectImportKeys))
      .join(" & ");
  } else if (ApiParamType.isArray(paramType)) {
    return (
      apiParamTypeToTsType(paramType.elementsType, injectImportKeys) + "[]"
    );
  } else if (ApiParamType.isRef(paramType)) {
    if (
      ["Pick", "Omit", "Promise", "Partial"].includes(paramType.id) === false
    ) {
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
      injectImportKeys
    )}[${apiParamTypeToTsType(paramType.index, injectImportKeys)}]`;
  } else if (ApiParamType.isTupleType(paramType)) {
    return `[ ${paramType.elements.map((elem) =>
      apiParamTypeToTsType(elem, injectImportKeys)
    )} ]`;
  } else if (ApiParamType.isTypeParam(paramType)) {
    return `<${paramType.id}${
      paramType.constraint
        ? ` extends ${apiParamTypeToTsType(
            paramType.constraint,
            injectImportKeys
          )}`
        : ""
    }>`;
  } else {
    throw new Error(`resolve 불가 ApiParamType ${paramType}`);
  }
}

export function unwrapPromiseOnce(paramType: ApiParamType) {
  if (ApiParamType.isPromise(paramType)) {
    return paramType.args![0];
  } else {
    return paramType;
  }
}

export function serializeZodType(zt: z.ZodTypeAny): any {
  switch (zt._def.typeName) {
    case "ZodObject":
      return {
        type: "object",
        shape: Object.keys((zt as z.ZodObject<any>).shape).reduce(
          (result, key) => {
            return {
              ...result,
              [key]: serializeZodType((zt as z.ZodObject<any>).shape[key]),
            };
          },
          {}
        ),
      };
    case "ZodArray":
      return {
        type: "array",
        element: serializeZodType(zt._def.type),
      };
    case "ZodEnum":
      return {
        type: "enum",
        values: zt._def.values,
      };
    case "ZodString":
      return {
        type: "string",
        checks: zt._def.checks,
      };
    case "ZodNumber":
      return {
        type: "number",
        checks: zt._def.checks,
      };
    case "ZodBoolean":
      return {
        type: "boolean",
      };
    case "ZodNullable":
      return {
        ...serializeZodType(zt._def.innerType),
        nullable: true,
      };
    case "ZodOptional":
      return {
        ...serializeZodType(zt._def.innerType),
        optional: true,
      };
    case "ZodAny":
      return {
        type: "any",
      };
    case "ZodRecord":
      return {
        type: "record",
        keyType: serializeZodType((zt as ZodRecord)._def.keyType),
        valueType: serializeZodType((zt as ZodRecord)._def.valueType),
      };
    case "ZodUnion":
      return {
        type: "union",
        options: (zt._def as z.ZodUnionDef).options.map((option) =>
          serializeZodType(option)
        ),
      };
    default:
      throw new Error(
        `Serialize 로직이 정의되지 않은 ZodType: ${zt._def.typeName}`
      );
  }
}

export function zodTypeToTsTypeDef(
  zt: z.ZodFirstPartySchemaTypes | z.ZodObject<any>
): string {
  if (zt._def.description) {
    return zt._def.description;
  }

  switch (zt._def.typeName) {
    case "ZodString":
      return "string";
    case "ZodNumber":
      return "number";
    case "ZodBoolean":
      return "boolean";
    case "ZodBigInt":
      return "bigint";
    case "ZodDate":
      return "date";
    case "ZodNull":
      return "null";
    case "ZodUndefined":
      return "undefined";
    case "ZodAny":
      return "any";
    case "ZodUnknown":
      return "unknown";
    case "ZodNever":
      return "never";
    case "ZodNullable":
      return zodTypeToTsTypeDef(zt._def.innerType) + " | null";
    case "ZodDefault":
      return zodTypeToTsTypeDef(zt._def.innerType);
    case "ZodRecord":
      return `{ [ key: ${zodTypeToTsTypeDef(
        zt._def.keyType
      )} ]: ${zodTypeToTsTypeDef(zt._def.valueType)}}`;
    case "ZodLiteral":
      if (typeof zt._def.value === "string") {
        return `"${zt._def.value}"`;
      } else {
        return `${zt._def.value}`;
      }
    case "ZodUnion":
      return `${zt._def.options
        .map((option: z.ZodTypeAny) => zodTypeToTsTypeDef(option))
        .join(" | ")}`;
    case "ZodEnum":
      return `${zt._def.values.map((val: string) => `"${val}"`).join(" | ")}`;
    case "ZodArray":
      return `${zodTypeToTsTypeDef(zt._def.type)}[]`;
    case "ZodObject":
      const shape = (zt as any).shape;
      return [
        "{",
        ...Object.keys(shape).map((key) => {
          if (shape[key]._def.typeName === "ZodOptional") {
            return `${key}?: ${zodTypeToTsTypeDef(shape[key]._def.innerType)},`;
          } else {
            return `${key}: ${zodTypeToTsTypeDef(shape[key])},`;
          }
        }),
        "}",
      ].join("\n");
    case "ZodOptional":
      return zodTypeToTsTypeDef(zt._def.innerType) + " | undefined";
    default:
      throw new Error(`처리되지 않은 ZodType ${zt._def.typeName}`);
  }
}
