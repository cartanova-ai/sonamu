import { z } from "zod";
import {
  ApiParam,
  ApiParamType,
  EntityProp,
  EntityPropNode,
  TextProp,
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
    api.parameters.filter(
      (param) =>
        !ApiParamType.isContext(param.type) &&
        !ApiParamType.isRefKnex(param.type) &&
        !(param.optional === true && param.name.startsWith("_")) // _로 시작하는 파라미터는 제외
    ),
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
): z.ZodObject {
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

          // Date 타입 처리
          if (refType.id === "Date") {
            return z.date();
          }

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
              keys = literalOrUnion.def.options.map(
                (option: { def: { value: string } }) => option.def.value
              );
            } else {
              keys = (literalOrUnion as z.ZodLiteral<string>).def.values;
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
          // nullable 유니온
          if (
            unionType.types.length === 2 &&
            unionType.types.some((type) => type === "null")
          ) {
            if (unionType.types[0] === "null") {
              return getZodTypeFromApiParamType(
                unionType.types[1],
                references
              ).nullable();
            } else {
              return getZodTypeFromApiParamType(
                unionType.types[0],
                references
              ).nullable();
            }
          }

          // 일반 유니온
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
  propNode: EntityPropNode,
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
      `})${propNode.prop && propNode.prop.nullable ? ".nullable()" : ""},`,
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
  prop: EntityProp,
  injectImportKeys: string[]
): string {
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
    if (
      isBelongsToOneRelationProp(prop) ||
      (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
    ) {
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

  return stmt + ",";
}

// TODO(Haze, 251031): "template_literal", "file"에 대한 지원이 필요함.
export function zodTypeToZodCode(zt: z.ZodType<any>): string {
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
      return zodTypeToZodCode((zt as z.ZodNullable<any>).def.innerType) + ".nullable()";
    case "default":
      const zDefaultDef = (zt as z.ZodDefault<any>).def;
      return (
        zodTypeToZodCode(zDefaultDef.innerType) +
        `.default(${zDefaultDef.defaultValue()})`
      );
    case "record":
      const zRecordDef = (zt as z.ZodRecord<any, any>).def;
      return `z.record(${zodTypeToZodCode(zRecordDef.keyType)}, ${zodTypeToZodCode(
        zRecordDef.valueType
      )})`;
    case "literal":
      const items = Array.from((zt as z.ZodLiteral<any>).values).map(value => {
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
    case "union":
      return `z.union([${(zt as z.ZodUnion<any>).def.options
        .map((option: z.ZodType<any>) => zodTypeToZodCode(option))
        .join(",")}])`;
    case "enum":
      // NOTE: z.enum(["A", "B"])도 z.enum({ A: "A", B: "B" })로 처리됨.
      return `z.enum([${Object.entries((zt as z.ZodEnum).def.entries)
        .map(([key, val]) =>
          typeof val === "string" ? `${key}: "${val}"` : `${key}: ${val}`)
        .join(", ")}})`;
    case "array":
      return `z.array(${zodTypeToZodCode((zt as z.ZodArray<z.ZodType>).def.element)})`;
    case "object":
      const shape = (zt as any).shape;
      return [
        "z.object({",
        ...Object.keys(shape).map(
          (key) => `${key}: ${zodTypeToZodCode(shape[key])},`
        ),
        "})",
      ].join("\n");
    case "optional":
      return zodTypeToZodCode((zt as z.ZodOptional<z.ZodType>).def.innerType) + ".optional()";
    case "file":
      return `z.file()`;
    case "intersection":
      const zIntersectionDef = (zt as z.ZodIntersection<z.ZodType, z.ZodType>).def;
      return `z.intersection(${zodTypeToZodCode(zIntersectionDef.left)}, ${zodTypeToZodCode(zIntersectionDef.right)})`;
    case "file":
      return `z.file()`;
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
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

export function apiParamToTsCodeAsObject(
  params: ApiParam[],
  injectImportKeys: string[]
): string {
  return `{ ${params
    .map(
      (param) =>
        `${param.name}${param.optional ? "?" : ""}: ${apiParamTypeToTsType(
          param.type,
          injectImportKeys
        )}${param.defaultDef ? `= ${param.defaultDef}` : ""}`
    )
    .join(", ")} }`;
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
      ["Pick", "Omit", "Promise", "Partial", "Date"].includes(paramType.id) ===
      false
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

// TODO(Haze, 251031): "template_literal", "file"에 대한 지원이 필요함.
export function serializeZodType(zt: z.ZodTypeAny): any {
  switch (zt.def.type) {
    case "object":
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
    case "array":
      return {
        type: "array",
        element: serializeZodType((zt as z.ZodArray<any>).def.element),
      };
    case "enum":
      return {
        type: "enum",
        values: (zt as z.ZodEnum).def.entries,
      };
    case "string":
      return {
        type: "string",
        checks: zt.def.checks,
      };
    case "number":
      return {
        type: "number",
        checks: zt.def.checks,
      };
    case "boolean":
      return {
        type: "boolean",
      };
    case "nullable":
      return {
        ...serializeZodType((zt as z.ZodNullable<any>).def.innerType),
        nullable: true,
      };
    case "optional":
      return {
        ...serializeZodType((zt as z.ZodOptional<any>).def.innerType),
        optional: true,
      };
    case "any":
      return {
        type: "any",
      };
    case "record":
      return {
        type: "record",
        keyType: serializeZodType((zt as z.ZodRecord<any, any>).def.keyType),
        valueType: serializeZodType((zt as z.ZodRecord<any, any>).def.valueType),
      };
    case "union":
      return {
        type: "union",
        options: (zt.def as z.ZodUnion<z.ZodType<any>[]>).options.map((option) =>
          serializeZodType(option)
        ),
      };
    default:
      throw new Error(
        `Serialize 로직이 정의되지 않은 ZodType: ${zt.def.type}`
      );
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
      return zodTypeToTsTypeDef((zt as z.ZodNullable<any>).def.innerType) + " | null";
    case "default":
      return zodTypeToTsTypeDef((zt as z.ZodDefault<any>).def.innerType);
    case "record":
      const recordType = zt as z.ZodRecord<any, any>;
      return `{ [ key: ${zodTypeToTsTypeDef(
        recordType.def.keyType
      )} ]: ${zodTypeToTsTypeDef(recordType.def.valueType)}}`;
    case "literal":
      return Array.from((zt as z.ZodLiteral<any>).values).map(value => {
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
      }).join(" | ")
    case "union":
      return `${(zt as z.ZodUnion<z.ZodTypeAny[]>).options
        .map((option) => zodTypeToTsTypeDef(option))
        .join(" | ")}`;
    case "enum":
      return `${(zt as z.ZodEnum).options.map((val) => `"${val}"`).join(" | ")}`;
    case "array":
      return `${zodTypeToTsTypeDef((zt as z.ZodArray<any>).element.type)}[]`;
    case "object":
      const shape = (zt as z.ZodObject<any>).shape;
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
    case "optional":
      return zodTypeToTsTypeDef((zt as z.ZodOptional<any>).def.innerType) + " | undefined";
    default:
      throw new Error(`처리되지 않은 ZodType ${zt.def.type}`);
  }
}
