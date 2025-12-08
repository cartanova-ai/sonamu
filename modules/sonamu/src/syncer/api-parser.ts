import assert from "assert";
import { readFile } from "fs/promises";
import inflection from "inflection";
import ts from "typescript";
import { type ExtendedApi, registeredApis } from "../api/decorators";
import { validateMethodName } from "../api/validator";
import type { ApiParam, ApiParamType } from "../types/types";
import type { AbsolutePath } from "../utils/path-utils";

/**
 * TypeScript 파일을 파싱하여 API 메소드 정보를 추출합니다.
 * @api 데코레이터가 붙은 메소드들의 타입 정보를 분석합니다.
 * @param filePath - 파싱할 TypeScript 파일의 절대 경로
 * @returns API 메소드 정보 배열 (타입 파라미터, 파라미터, 리턴 타입 등)
 */
export async function readApisFromFile(filePath: AbsolutePath): Promise<ExtendedApi[]> {
  if (!filePath.endsWith(".ts")) {
    throw new Error(
      `${filePath} does not seem to be a TypeScript file. Please check the file path. We only support parsing TypeScript files.`,
    );
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    (await readFile(filePath)).toString(),
    ts.ScriptTarget.Latest,
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
        validateMethodName(methodName);
      }

      const typeParameters: ApiParamType.TypeParam[] = (node.typeParameters ?? []).map(
        (typeParam) => {
          const tp = typeParam as ts.TypeParameterDeclaration;

          return {
            t: "type-param",
            id: tp.name.escapedText.toString(),
            constraint: tp.constraint ? resolveTypeNode(tp.constraint) : undefined,
          };
        },
      );
      const parameters: ApiParam[] = node.parameters.map((paramDec, index) => {
        const defaultDef = printNode(paramDec.initializer, sourceFile);

        // 기본값이 있는 경우 paramDec.type가 undefined로 나옴

        return resolveParamDec(
          {
            name: paramDec.name,
            type: paramDec.type as ts.TypeNode,
            optional: paramDec.questionToken !== undefined || paramDec.initializer !== undefined,
            defaultDef,
          },
          index,
        );
      });
      if (node.type === undefined) {
        throw new Error(`리턴 타입이 기재되지 않은 메소드 ${modelName}.${methodName}`);
      }
      const returnType = resolveTypeNode(node.type);

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
      (method) => method.modelName === api.modelName && method.methodName === api.methodName,
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
      (method) => method.modelName === api.modelName && method.methodName === api.methodName,
    );
    if (!foundMethod) {
      throw new Error(`API ${api.modelName}.${api.methodName} not found in ${filePath}`);
    }
    return {
      ...api,
      typeParameters: foundMethod?.typeParameters,
      parameters: foundMethod?.parameters,
      returnType: foundMethod?.returnType,
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
    case ts.SyntaxKind.LiteralType: {
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
    }
    case ts.SyntaxKind.ArrayType: {
      const arrNode = typeNode as ts.ArrayTypeNode;
      return {
        t: "array",
        elementsType: resolveTypeNode(arrNode.elementType),
      };
    }
    case ts.SyntaxKind.TypeLiteral: {
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
                escapedText: `[${res.name}${res.optional ? "?" : ""}: ${res.type}]`,
              } as ts.Identifier,
              type: member.type as ts.TypeNode,
            });
          } else {
            return resolveParamDec({
              name: (member as ts.PropertySignature).name as ts.Identifier,
              type: (member as ts.PropertySignature).type as ts.TypeNode,
              optional: (member as ts.PropertySignature).questionToken !== undefined,
            });
          }
        }),
      };
    }
    case ts.SyntaxKind.TypeReference:
      return {
        t: "ref",
        id: ((typeNode as ts.TypeReferenceNode).typeName as ts.Identifier).escapedText.toString(),
        args: (typeNode as ts.TypeReferenceNode).typeArguments?.map((typeArg) =>
          resolveTypeNode(typeArg),
        ),
      };
    case ts.SyntaxKind.UnionType:
      return {
        t: "union",
        types: (typeNode as ts.UnionTypeNode).types.map((type) => resolveTypeNode(type)),
      };
    case ts.SyntaxKind.IntersectionType:
      return {
        t: "intersection",
        types: (typeNode as ts.IntersectionTypeNode).types.map((type) => resolveTypeNode(type)),
      };
    case ts.SyntaxKind.IndexedAccessType:
      return {
        t: "indexed-access",
        object: resolveTypeNode((typeNode as ts.IndexedAccessTypeNode).objectType),
        index: resolveTypeNode((typeNode as ts.IndexedAccessTypeNode).indexType),
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
  index: number = 0,
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

function printNode(node: ts.Node | undefined, sourceFile: ts.SourceFile): string | undefined {
  if (node === undefined) {
    return undefined;
  }

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
}
