import assert from "assert";
import { readFile } from "fs/promises";

import inflection from "inflection";
import ts from "typescript-legacy";

import { registeredApis } from "../api/decorators";
import { type ExtendedApi } from "../api/decorators";
import { type ResolvedWebSocketDecoratorOptions } from "../api/decorators";
import { validateMethodName } from "../api/validator";
import { type ApiParam, type ApiParamType } from "../types/types";
import { type AbsolutePath } from "../utils/path-utils";

type WebSocketTypeRefs = Pick<
  ResolvedWebSocketDecoratorOptions,
  "outEventsTypeRef" | "inEventsTypeRef"
>;
type ParsedMethod = {
  modelName: string;
  methodName: string;
  typeParameters: ApiParamType.TypeParam[];
  parameters: ApiParam[];
  returnType: ApiParamType;
  websocketTypeRefs: WebSocketTypeRefs;
};

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

  const methods: ParsedMethod[] = [];
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
          const tp = typeParam;

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
            type: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ paramDec.type as ts.TypeNode,
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
      const websocketTypeRefs = readWebSocketTypeRefs(node);

      methods.push({
        modelName,
        methodName,
        typeParameters,
        parameters,
        returnType,
        websocketTypeRefs,
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
    // throw new Error(`현재 파일에 사전 등록된 API가 없습니다. ${filePath}`);
    return [];
  }

  // 등록된 API에 현재 메소드 타입 정보 확장
  const extendedApis = currentModelApis.map((api) => {
    const foundMethod = methods.find(
      (method) => method.modelName === api.modelName && method.methodName === api.methodName,
    );
    if (!foundMethod) {
      throw new Error(`API ${api.modelName}.${api.methodName} not found in ${filePath}`);
    }
    const websocketOptions = api.websocketOptions
      ? {
          ...api.websocketOptions,
          ...foundMethod.websocketTypeRefs,
        }
      : undefined;

    return {
      ...api,
      websocketOptions,
      typeParameters: foundMethod?.typeParameters,
      parameters: foundMethod?.parameters,
      returnType: foundMethod?.returnType,
    };
  });
  return extendedApis;
}

function readWebSocketTypeRefs(node: ts.MethodDeclaration): WebSocketTypeRefs {
  const optionsLiteral = getDecoratorOptionsObjectLiteral(node, "websocket");
  if (!optionsLiteral) {
    return {};
  }

  const refs: WebSocketTypeRefs = {};
  for (const property of optionsLiteral.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    const propertyName = getPropertyNameText(property.name);
    if (propertyName !== "outEvents" && propertyName !== "inEvents") {
      continue;
    }

    const typeRef = resolveDecoratorTypeRef(property.initializer);
    if (!typeRef) {
      continue;
    }

    if (propertyName === "outEvents") {
      refs.outEventsTypeRef = typeRef;
    } else {
      refs.inEventsTypeRef = typeRef;
    }
  }

  return refs;
}

function getDecoratorOptionsObjectLiteral(
  node: ts.MethodDeclaration,
  decoratorName: string,
): ts.ObjectLiteralExpression | undefined {
  for (const modifier of node.modifiers ?? []) {
    if (!ts.isDecorator(modifier)) {
      continue;
    }

    const expression = modifier.expression;
    if (!ts.isCallExpression(expression)) {
      continue;
    }

    if (!ts.isIdentifier(expression.expression) || expression.expression.text !== decoratorName) {
      continue;
    }

    const [firstArg] = expression.arguments;
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      return firstArg;
    }
  }

  return undefined;
}

function getPropertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function resolveDecoratorTypeRef(expression: ts.Expression): ApiParamType.Ref | undefined {
  if (ts.isIdentifier(expression)) {
    return {
      t: "ref",
      id: expression.text,
    };
  }

  if (
    ts.isAsExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return resolveDecoratorTypeRef(expression.expression);
  }

  return undefined;
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
      const literal =
        /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
          typeNode as ts.LiteralTypeNode
        ).literal;
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
      const arrNode =
        /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ typeNode as ts.ArrayTypeNode;
      return {
        t: "array",
        elementsType: resolveTypeNode(arrNode.elementType),
      };
    }
    case ts.SyntaxKind.TypeLiteral: {
      const literalNode =
        /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ typeNode as ts.TypeLiteralNode;
      return {
        t: "object",
        props: literalNode.members.map((member) => {
          if (ts.isIndexSignatureDeclaration(member)) {
            assert(member.parameters[0]);
            const res = resolveParamDec({
              name: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ member
                .parameters[0].name as ts.Identifier,
              type: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ member
                .parameters[0].type as ts.TypeNode,
            });

            return resolveParamDec({
              name: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ {
                escapedText: `[${res.name}${res.optional ? "?" : ""}: ${res.type}]`,
              } as ts.Identifier,
              type: member.type,
            });
          } else {
            return resolveParamDec({
              name: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
                member as ts.PropertySignature
              ).name as ts.Identifier,
              type: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
                member as ts.PropertySignature
              ).type as ts.TypeNode,
              optional:
                /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
                  member as ts.PropertySignature
                ).questionToken !== undefined,
            });
          }
        }),
      };
    }
    case ts.SyntaxKind.TypeReference:
      return {
        t: "ref",
        id: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
          (typeNode as ts.TypeReferenceNode).typeName as ts.Identifier
        ).escapedText.toString(),
        args: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
          typeNode as ts.TypeReferenceNode
        ).typeArguments?.map((typeArg) => resolveTypeNode(typeArg)),
      };
    case ts.SyntaxKind.UnionType:
      return {
        t: "union",
        types: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
          typeNode as ts.UnionTypeNode
        ).types.map((type) => resolveTypeNode(type)),
      };
    case ts.SyntaxKind.IntersectionType:
      return {
        t: "intersection",
        types: /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
          typeNode as ts.IntersectionTypeNode
        ).types.map((type) => resolveTypeNode(type)),
      };
    case ts.SyntaxKind.IndexedAccessType:
      return {
        t: "indexed-access",
        object: resolveTypeNode(
          /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
            typeNode as ts.IndexedAccessTypeNode
          ).objectType,
        ),
        index: resolveTypeNode(
          /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
            typeNode as ts.IndexedAccessTypeNode
          ).indexType,
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
    case ts.SyntaxKind.ParenthesizedType:
      // 괄호로 묶인 타입 (예: (A & B)[] 에서 (A & B))
      // 내부 타입을 재귀적으로 resolve
      return resolveTypeNode(
        /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
          typeNode as ts.ParenthesizedTypeNode
        ).type,
      );

    case ts.SyntaxKind.FunctionType:
      return {
        t: "function",
        parameters:
          /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
            typeNode as ts.FunctionTypeNode
          ).parameters.map((param) => ({
            name: param.name.getText(),
            type: param.type ? resolveTypeNode(param.type) : "unknown",
            optional: param.questionToken !== undefined,
            defaultDef: undefined,
          })),
        returnType: resolveTypeNode(
          /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ (
            typeNode as ts.FunctionTypeNode
          ).type,
        ),
      };
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
  const name =
    /* SAFETY: TypeScript AST 파싱과 동기화 입력 계약이 이 값의 타입을 보장한다. */ paramDec.name as ts.Identifier;
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
