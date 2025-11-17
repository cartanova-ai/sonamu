import path from "path";
import { Sonamu } from "../api/sonamu";
import {
  ApiParam,
  ApiParamType,
  EntityProp,
  EntityPropNode,
  isIntegerProp,
  RenderingNode,
  isBelongsToOneRelationProp,
  isBigIntegerProp,
  isBooleanProp,
  isDateProp,
  isDateTimeProp,
  isDecimalProp,
  isDoubleProp,
  isEnumProp,
  isFloatProp,
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
import { readFile } from "fs/promises";
import * as _ from "lodash-es";
import { EntityManager } from "../entity/entity-manager";
import ts from "typescript";
import { ExtendedApi, registeredApis } from "../api/decorators";
import inflection from "inflection";
import z from "zod";
import assert from "assert";
import { getTextTypeLength } from "../api/code-converters";
import { AbsolutePath } from "../utils/path-utils";

export async function readApisFromFile(filePath: AbsolutePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    (await readFile(filePath)).toString(),
    ts.ScriptTarget.Latest
  );

  const methods: Omit<ExtendedApi, "path" | "options">[] = [];
  let modelName: string = "UnknownModel";
  let methodName: string = "unknownMethod";
  const visitor = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      if (node.name && ts.isIdentifier(node.name)) {
        modelName = node.name.escapedText.toString().replace(/Class$/, "");
      }
    }
    if (ts.isMethodDeclaration(node)) {
      if (ts.isIdentifier(node.name)) {
        methodName = node.name.escapedText.toString();
      }

      const typeParameters: ApiParamType.TypeParam[] = (
        node.typeParameters ?? []
      ).map((typeParam) => {
        const tp = typeParam as ts.TypeParameterDeclaration;

        return {
          t: "type-param",
          id: tp.name.escapedText.toString(),
          constraint: tp.constraint
            ? resolveTypeNode(tp.constraint)
            : undefined,
        };
      });
      const parameters: ApiParam[] = node.parameters.map((paramDec, index) => {
        const defaultDef = printNode(paramDec.initializer, sourceFile);

        // 기본값이 있는 경우 paramDec.type가 undefined로 나옴

        return resolveParamDec(
          {
            name: paramDec.name,
            type: paramDec.type as ts.TypeNode,
            optional:
              paramDec.questionToken !== undefined ||
              paramDec.initializer !== undefined,
            defaultDef,
          },
          index
        );
      });
      if (node.type === undefined) {
        throw new Error(
          `리턴 타입이 기재되지 않은 메소드 ${modelName}.${methodName}`
        );
      }
      const returnType = resolveTypeNode(node.type!);

      methods.push({
        modelName,
        methodName,
        typeParameters,
        parameters,
        returnType,
      });
    }
    ts.forEachChild(node, visitor);
  };
  visitor(sourceFile);

  if (methods.length === 0) {
    return [];
  }

  // 현재 파일의 등록된 API 필터
  const currentModelApis = registeredApis.filter((api) => {
    return methods.find(
      (method) =>
        method.modelName === api.modelName &&
        method.methodName === api.methodName
    );
  });
  if (currentModelApis.length === 0) {
    // const p = path.join(tmpdir(), "sonamu-syncer-error.json");
    // writeFileSync(p, JSON.stringify(registeredApis, null, 2));
    // execSync(`open ${p}`);
    throw new Error(`현재 파일에 사전 등록된 API가 없습니다. ${filePath}`);
  }

  // 등록된 API에 현재 메소드 타입 정보 확장
  const extendedApis = currentModelApis.map((api) => {
    const foundMethod = methods.find(
      (method) =>
        method.modelName === api.modelName &&
        method.methodName === api.methodName
    );
    return {
      ...api,
      typeParameters: foundMethod!.typeParameters,
      parameters: foundMethod!.parameters,
      returnType: foundMethod!.returnType,
    };
  });
  return extendedApis;
}

function resolveTypeNode(typeNode: ts.TypeNode): ApiParamType {
  switch (typeNode?.kind) {
    case ts.SyntaxKind.AnyKeyword:
      return "any";
    case ts.SyntaxKind.UnknownKeyword:
      return "unknown";
    case ts.SyntaxKind.StringKeyword:
      return "string";
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.UndefinedKeyword:
      return "undefined";
    case ts.SyntaxKind.NullKeyword:
      return "null";
    case ts.SyntaxKind.VoidKeyword:
      return "void";
    case ts.SyntaxKind.LiteralType:
      const literal = (typeNode as ts.LiteralTypeNode).literal;
      if (ts.isStringLiteral(literal)) {
        return {
          t: "string-literal",
          value: literal.text,
        };
      } else if (ts.isNumericLiteral(literal)) {
        return {
          t: "numeric-literal",
          value: Number(literal.text),
        };
      } else {
        if (literal.kind === ts.SyntaxKind.NullKeyword) {
          return "null";
        } else if (literal.kind === ts.SyntaxKind.UndefinedKeyword) {
          return "undefined";
        } else if (literal.kind === ts.SyntaxKind.TrueKeyword) {
          return "true";
        } else if (literal.kind === ts.SyntaxKind.FalseKeyword) {
          return "false";
        }
        throw new Error("알 수 없는 리터럴");
      }
    case ts.SyntaxKind.ArrayType:
      const arrNode = typeNode as ts.ArrayTypeNode;
      return {
        t: "array",
        elementsType: resolveTypeNode(arrNode.elementType),
      };
    case ts.SyntaxKind.TypeLiteral:
      const literalNode = typeNode as ts.TypeLiteralNode;
      return {
        t: "object",
        props: literalNode.members.map((member) => {
          if (ts.isIndexSignatureDeclaration(member)) {
            assert(member.parameters[0]);
            const res = resolveParamDec({
              name: member.parameters[0].name as ts.Identifier,
              type: member.parameters[0].type as ts.TypeNode,
            });

            return resolveParamDec({
              name: {
                escapedText: `[${res.name}${res.optional ? "?" : ""}: ${
                  res.type
                }]`,
              } as ts.Identifier,
              type: member.type as ts.TypeNode,
            });
          } else {
            return resolveParamDec({
              name: (member as ts.PropertySignature).name as ts.Identifier,
              type: (member as ts.PropertySignature).type as ts.TypeNode,
              optional:
                (member as ts.PropertySignature).questionToken !== undefined,
            });
          }
        }),
      };
    case ts.SyntaxKind.TypeReference:
      return {
        t: "ref",
        id: (
          (typeNode as ts.TypeReferenceNode).typeName as ts.Identifier
        ).escapedText.toString(),
        args: (typeNode as ts.TypeReferenceNode).typeArguments?.map((typeArg) =>
          resolveTypeNode(typeArg)
        ),
      };
    case ts.SyntaxKind.UnionType:
      return {
        t: "union",
        types: (typeNode as ts.UnionTypeNode).types.map((type) =>
          resolveTypeNode(type)
        ),
      };
    case ts.SyntaxKind.IntersectionType:
      return {
        t: "intersection",
        types: (typeNode as ts.IntersectionTypeNode).types.map((type) =>
          resolveTypeNode(type)
        ),
      };
    case ts.SyntaxKind.IndexedAccessType:
      return {
        t: "indexed-access",
        object: resolveTypeNode(
          (typeNode as ts.IndexedAccessTypeNode).objectType
        ),
        index: resolveTypeNode(
          (typeNode as ts.IndexedAccessTypeNode).indexType
        ),
      };
    case ts.SyntaxKind.TupleType:
      if (ts.isTupleTypeNode(typeNode)) {
        return {
          t: "tuple-type",
          elements: typeNode.elements.map((elem) => resolveTypeNode(elem)),
        };
      }
      break;
    case undefined:
      throw new Error(`typeNode undefined`);
  }

  console.debug(typeNode);
  throw new Error(`알 수 없는 SyntaxKind ${typeNode.kind}`);
}

function resolveParamDec(
  paramDec: {
    name: ts.BindingName;
    type: ts.TypeNode;
    optional?: boolean;
    defaultDef?: string;
  },
  index: number = 0
): ApiParam {
  const name = paramDec.name as ts.Identifier;
  const type = resolveTypeNode(paramDec.type);

  if (name === undefined) {
    console.debug({ name, type, paramDec });
  }

  const result: ApiParam = {
    name: name.escapedText ? name.escapedText.toString() : `nonameAt${index}`,
    type,
    optional: paramDec.optional === true,
    defaultDef: paramDec?.defaultDef,
  };

  // 구조분해할당의 경우 타입이름 사용
  if (
    ts.isObjectBindingPattern(name) &&
    ts.isTypeReferenceNode(paramDec.type) &&
    ts.isIdentifier(paramDec.type.typeName)
  ) {
    result.name = inflection.camelize(paramDec.type.typeName.text, true);
  }

  return result;
}

function printNode(
  node: ts.Node | undefined,
  sourceFile: ts.SourceFile
): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}

export async function getZodTypeById(zodTypeId: string): Promise<z.ZodTypeAny> {
  const modulePath = EntityManager.getModulePath(zodTypeId);
  const moduleAbsPath = path.join(
    Sonamu.apiRootPath,
    "dist",
    "application",
    modulePath + ".js"
  );
  const { createImportUrl } = await import("../utils/esm-utils");
  console.log(`Wow it works? ${createImportUrl}`);
  const importUrl = createImportUrl(moduleAbsPath);
  const imported = await import(importUrl);

  if (!imported[zodTypeId]) {
    throw new Error(`존재하지 않는 zodTypeId ${zodTypeId}`);
  }
  return imported[zodTypeId].describe(zodTypeId);
}

export async function propNodeToZodType(
  propNode: EntityPropNode
): Promise<z.ZodTypeAny> {
  if (propNode.nodeType === "plain") {
    return propToZodType(propNode.prop);
  } else if (propNode.nodeType === "array") {
    if (propNode.prop === undefined) {
      throw new Error();
    } else if (propNode.children.length > 0) {
      return (
        await propNodeToZodType({
          ...propNode,
          nodeType: "object",
        })
      ).array();
    } else {
      const innerType = await propToZodType(propNode.prop);
      if (propNode.prop.nullable === true) {
        return z.array(innerType).nullable();
      } else {
        return z.array(innerType);
      }
    }
  } else if (propNode.nodeType === "object") {
    const obj = await propNode.children.reduce(
      async (promise, childPropNode) => {
        const result = await promise;
        result[childPropNode.prop!.name] =
          await propNodeToZodType(childPropNode);
        return result;
      },
      {} as any
    );

    if (propNode.prop?.nullable === true) {
      return z.object(obj).nullable();
    } else {
      return z.object(obj);
    }
  } else {
    throw Error;
  }
}

async function propToZodType(prop: EntityProp): Promise<z.ZodTypeAny> {
  let zodType: z.ZodTypeAny = z.unknown();
  if (isIntegerProp(prop)) {
    zodType = z.number().int();
  } else if (isBigIntegerProp(prop)) {
    zodType = z.bigint();
  } else if (isTextProp(prop)) {
    zodType = z.string().max(getTextTypeLength(prop.textType));
  } else if (isEnumProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isStringProp(prop)) {
    zodType = z.string().max(prop.length);
  } else if (isFloatProp(prop) || isDoubleProp(prop)) {
    zodType = z.number();
  } else if (isDecimalProp(prop)) {
    zodType = z.string();
  } else if (isBooleanProp(prop)) {
    zodType = z.boolean();
  } else if (isDateProp(prop)) {
    zodType = z.string().length(10);
  } else if (isTimeProp(prop)) {
    zodType = z.string().length(8);
  } else if (isDateTimeProp(prop)) {
    zodType = z.date();
  } else if (isTimestampProp(prop)) {
    zodType = z.date();
  } else if (isJsonProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isUuidProp(prop)) {
    zodType = z.uuid();
  } else if (isVirtualProp(prop)) {
    zodType = await getZodTypeById(prop.id);
  } else if (isRelationProp(prop)) {
    if (
      isBelongsToOneRelationProp(prop) ||
      (isOneToOneRelationProp(prop) && prop.hasJoinColumn)
    ) {
      zodType = z.number().int();
    }
  } else {
    throw new Error(`prop을 zodType으로 변환하는데 실패 ${prop}}`);
  }

  if ((prop as { unsigned?: boolean }).unsigned) {
    zodType = (zodType as z.ZodNumber).nonnegative();
  }
  if (prop.nullable) {
    zodType = zodType.nullable();
  }

  return zodType;
}

function resolveRenderType(
  key: string,
  zodType: z.ZodTypeAny
): RenderingNode["renderType"] {
  if (zodType instanceof z.ZodDate) {
    return "datetime";
  } else if (zodType instanceof z.ZodString) {
    if (key.includes("img") || key.includes("image")) {
      return "string-image";
    } else if (zodType.description === "SQLDateTimeString") {
      return "string-datetime";
    } else if (key.endsWith("date")) {
      return "string-date";
    } else {
      return "string-plain";
    }
  } else if (zodType instanceof z.ZodNumber) {
    if (key === "id") {
      return "number-id";
    } else if (key.endsWith("_id")) {
      return "number-fk_id";
    } else {
      return "number-plain";
    }
  } else if (zodType instanceof z.ZodBoolean) {
    return "boolean";
  } else if (zodType instanceof z.ZodEnum) {
    return "enums";
  } else if (zodType instanceof z.ZodRecord) {
    return "record";
  } else if (zodType instanceof z.ZodAny || zodType instanceof z.ZodUnknown) {
    return "string-plain";
  } else if (zodType instanceof z.ZodUnion) {
    return "string-plain";
  } else if (zodType instanceof z.ZodLiteral) {
    return "string-plain";
  } else {
    throw new Error(`타입 파싱 불가 ${key} ${zodType.def.type}`);
  }
}

export function zodTypeToRenderingNode(
  zodType: z.ZodType<any>,
  baseKey: string = "root"
): RenderingNode {
  const def = {
    name: baseKey,
    label: inflection.camelize(baseKey, false),
    zodType,
  };
  if (zodType instanceof z.ZodObject) {
    const columnKeys = Object.keys(zodType.shape);
    const children = columnKeys.map((key) => {
      const innerType = zodType.shape[key];
      return zodTypeToRenderingNode(innerType, key);
    });
    return {
      ...def,
      renderType: "object",
      children,
    };
  } else if (zodType instanceof z.ZodArray) {
    const innerType = (zodType as z.ZodArray<z.ZodType<any>>).def.element;
    if (innerType instanceof z.ZodString && baseKey.includes("images")) {
      return {
        ...def,
        renderType: "array-images",
      };
    }
    return {
      ...def,
      renderType: "array",
      element: zodTypeToRenderingNode(innerType, baseKey),
    };
  } else if (zodType instanceof z.ZodUnion) {
    const optionNodes = (zodType as z.ZodUnion<z.ZodType[]>).def.options.map(
      (opt) => zodTypeToRenderingNode(opt, baseKey)
    );
    // TODO: ZodUnion이 들어있는 경우 핸들링
    return optionNodes[0];
  } else if (zodType instanceof z.ZodOptional) {
    return {
      ...zodTypeToRenderingNode(
        (zodType as z.ZodOptional<z.ZodType>).def.innerType,
        baseKey
      ),
      optional: true,
    };
  } else if (zodType instanceof z.ZodNullable) {
    return {
      ...zodTypeToRenderingNode(
        (zodType as z.ZodNullable<z.ZodType>).def.innerType,
        baseKey
      ),
      nullable: true,
    };
  } else {
    return {
      ...def,
      renderType: resolveRenderType(baseKey, zodType),
    };
  }
}
