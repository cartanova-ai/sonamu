import fs from "fs";
import ts from "typescript";

/**
 * dict 파일 파싱 결과 타입
 * - value: 실제 값 (문자열은 따옴표 없이, 함수는 원본 소스)
 * - isFunction: 함수 여부
 */
export type DictEntry = {
  key: string;
  value: string;
  isFunction: boolean;
};

/**
 * TypeScript Compiler API를 사용하여 dict 파일 파싱
 *
 * 지원 패턴:
 * - export default { ... } as const;
 * - export default defineLocale({ ... });
 * - 문자열 값: "key": "value" 또는 key: `value`
 * - 함수 값: "key": (param: Type) => `template`
 */
export function parseDictFile(filePath: string): DictEntry[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const entries: DictEntry[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node)) {
      const objectLiteral = unwrapToObjectLiteral(node.expression);
      if (objectLiteral) {
        extractEntriesFromObject(objectLiteral, sourceFile, entries);
      }
    }
  });

  return entries;
}

/**
 * 파일에서 특정 이름의 const 선언을 찾아 ObjectLiteral 파싱
 * 예: const entityLabels = { ... } as const;
 */
export function parseConstObjectDeclaration(filePath: string, varName: string): DictEntry[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const entries: DictEntry[] = [];

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === varName && decl.initializer) {
          const objectLiteral = unwrapToObjectLiteral(decl.initializer);
          if (objectLiteral) {
            extractEntriesFromObject(objectLiteral, sourceFile, entries);
          }
        }
      }
    }
  });

  return entries;
}

/**
 * ObjectLiteralExpression에서 DictEntry 추출
 */
function extractEntriesFromObject(
  objectLiteral: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile,
  entries: DictEntry[],
): void {
  for (const prop of objectLiteral.properties) {
    const entry = extractDictEntry(prop, sourceFile);
    if (entry) {
      entries.push(entry);
    }
  }
}

/**
 * export default 표현식에서 ObjectLiteralExpression 추출
 * - as const 처리
 * - defineLocale({ ... }) 호출 처리
 */
function unwrapToObjectLiteral(expr: ts.Expression): ts.ObjectLiteralExpression | null {
  // as const 처리
  if (ts.isAsExpression(expr)) {
    return unwrapToObjectLiteral(expr.expression);
  }
  // 직접 객체 리터럴
  if (ts.isObjectLiteralExpression(expr)) {
    return expr;
  }
  // defineLocale({ ... }) 호출
  if (ts.isCallExpression(expr)) {
    const firstArg = expr.arguments[0];
    if (firstArg && ts.isObjectLiteralExpression(firstArg)) {
      return firstArg;
    }
  }
  return null;
}

/**
 * PropertyName에서 키 문자열 추출
 * - 문자열 리터럴: "key"
 * - 식별자: key (unquoted)
 */
function getPropertyKey(name: ts.PropertyName): string | null {
  if (ts.isStringLiteral(name)) {
    return name.text;
  }
  if (ts.isIdentifier(name)) {
    return name.text;
  }
  return null;
}

/**
 * 프로퍼티에서 DictEntry 추출
 * - 문자열: 실제 문자열 값
 * - 함수: 원본 소스 (여러 줄은 한 줄로 정규화)
 */
function extractDictEntry(
  prop: ts.ObjectLiteralElementLike,
  sourceFile: ts.SourceFile,
): DictEntry | null {
  if (!ts.isPropertyAssignment(prop)) {
    return null;
  }

  const key = getPropertyKey(prop.name);
  if (!key) return null;

  const init = prop.initializer;

  // 화살표 함수
  if (ts.isArrowFunction(init)) {
    const funcText = init.getText(sourceFile);
    const normalized = funcText.replace(/\s*\n\s*/g, " ").trim();
    return { key, value: normalized, isFunction: true };
  }

  // 문자열 리터럴
  if (ts.isStringLiteral(init)) {
    return { key, value: init.text, isFunction: false };
  }

  // 템플릿 리터럴 (변수 없음)
  if (ts.isNoSubstitutionTemplateLiteral(init)) {
    return { key, value: init.text, isFunction: false };
  }

  // 기타 (예: 함수 표현식)
  return {
    key,
    value: init.getText(sourceFile),
    isFunction: ts.isFunctionExpression(init),
  };
}

const ARROW_FUNCTION_PATTERN = /^\s*\([^)]*\)\s*=>/;

/**
 * 문자열이 화살표 함수 또는 함수 표현식인지 판별
 */
export function isExpressionFunction(code: string): boolean {
  // 빈 문자열이나 공백만 있는 경우
  if (!code.trim()) {
    return false;
  }

  return ARROW_FUNCTION_PATTERN.test(code);
}
