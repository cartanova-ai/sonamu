import fs from "fs";
import os from "os";
import path from "path";

import { Workbook } from "@sheetkit/node";
import ts from "@typescript/typescript6";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type SonamuConfig } from "../../api/config";
import { Sonamu } from "../../api/sonamu";
import { type AbsolutePath } from "../../utils/path-utils";
import { setSDConfig } from "../sd";
import { SonamuDictionary } from "../sonamu-dictionary";

const i18n = { defaultLocale: "ko", supportedLocales: ["ko", "en"] };

// 사전 관리 코드는 config의 i18n과 api.dir만 읽지만, SonamuConfig 전체 계약을 만족하는 값을 쓴다.
const testConfig = {
  api: { dir: "api", route: { prefix: "/api" } },
  i18n,
  sync: { targets: [] },
  database: {},
  server: {
    apiConfig: {
      contextProvider: (defaultContext) => defaultContext,
      guardHandler: () => undefined,
    },
  },
} satisfies SonamuConfig;

const KO_SEED = `export default {
  "common.results": (count: number) => \`\${count}개 결과\`,
  "common.save": "저장",
} as const;
`;

const EN_SEED = `import { defineLocale } from "./sd.generated";

export default defineLocale({
  "common.results": (count: number) => \`\${count} results\`,
  "common.save": "Save",
});
`;

// 따옴표를 닫고 계산된 속성 이름으로 코드를 끼워 넣으려는 키
const INJECTION_KEY = 'audit.x": 0, [globalThis.__son623 = 1]: 0, "audit.y';
// 함수처럼 보이지만 허용 목록(isExpressionFunction)을 통과하지 못하는 값
const NEW_FUNCTION_VALUE = "() => globalThis.__son623";

let apiRoot: AbsolutePath;
let dict: SonamuDictionary;

/**
 * 경로가 `/`로 시작하는지 확인해 AbsolutePath로 좁힙니다.
 */
function isAbsolutePath(value: string): value is AbsolutePath {
  return value.startsWith("/");
}

function dictPath(locale: string): string {
  return path.join(apiRoot, "src", "i18n", `${locale}.ts`);
}

function readDict(locale: string): string {
  return fs.readFileSync(dictPath(locale), "utf-8");
}

/**
 * 사전 파일의 기본 내보내기 객체 속성을 검사합니다.
 * 계산된 속성 이름이 있으면 실패시키고, 키와 값의 종류를 돌려줍니다.
 */
function inspectDict(locale: string): Map<string, "string" | "function"> {
  const source = ts.createSourceFile(
    dictPath(locale),
    readDict(locale),
    ts.ScriptTarget.Latest,
    true,
  );

  const visit = (node: ts.Node): void => {
    expect(ts.isComputedPropertyName(node), node.getText(source)).toBe(false);
    ts.forEachChild(node, visit);
  };
  visit(source);

  const result = new Map<string, "string" | "function">();
  for (const statement of source.statements) {
    if (!ts.isExportAssignment(statement)) continue;
    let expr: ts.Expression = statement.expression;
    if (ts.isAsExpression(expr)) expr = expr.expression;
    if (ts.isCallExpression(expr)) expr = expr.arguments[0];
    if (!ts.isObjectLiteralExpression(expr)) throw new Error("객체 리터럴이 아닙니다");
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop) || !ts.isStringLiteral(prop.name)) {
        throw new Error(`허용되지 않는 속성: ${prop.getText(source)}`);
      }
      if (ts.isStringLiteral(prop.initializer)) {
        result.set(prop.name.text, "string");
      } else if (ts.isArrowFunction(prop.initializer)) {
        result.set(prop.name.text, "function");
      } else {
        throw new Error(`허용되지 않는 값: ${prop.initializer.getText(source)}`);
      }
    }
  }
  return result;
}

function buildXlsx(rows: string[][]): Buffer {
  const wb = new Workbook();
  wb.setRowValues("Sheet1", 1, "A", ["key", "source", "ko", "en"]);
  rows.forEach((row, index) => {
    wb.setRowValues("Sheet1", index + 2, "A", row);
  });
  return wb.writeBufferSync();
}

beforeEach(() => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "son623-dict-"));
  if (!isAbsolutePath(tempDir)) {
    throw new Error(`임시 디렉터리가 절대 경로가 아닙니다: ${tempDir}`);
  }
  apiRoot = tempDir;
  fs.mkdirSync(path.join(apiRoot, "src", "i18n"), { recursive: true });
  fs.writeFileSync(dictPath("ko"), KO_SEED);
  fs.writeFileSync(dictPath("en"), EN_SEED);

  setSDConfig(i18n);
  vi.spyOn(Sonamu, "apiRootPath", "get").mockReturnValue(apiRoot);
  vi.spyOn(Sonamu, "config", "get").mockReturnValue(testConfig);
  dict = new SonamuDictionary();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(apiRoot, { recursive: true, force: true });
});

describe("SonamuDictionary 편집 API는 외부 키를 코드로 쓰지 않는다", () => {
  it("createEntry: 따옴표를 닫는 키도 문자열 리터럴 키로만 기록한다", async () => {
    await dict.createEntry({ key: INJECTION_KEY, values: { ko: "v" } });

    const entries = inspectDict("ko");
    expect(entries.get(INJECTION_KEY)).toBe("string");
    expect(dict.loadProjectDict("ko").entries).toContainEqual({
      key: INJECTION_KEY,
      value: "v",
      isFunction: false,
    });
  });

  it("createEntry: 허용된 화살표 함수는 함수로, 허용 목록 밖의 함수 형태 값은 문자열로 기록한다", async () => {
    await dict.createEntry({
      key: "audit.fn",
      values: { ko: "(count: number) => `${count}건`", en: NEW_FUNCTION_VALUE },
    });

    expect(inspectDict("ko").get("audit.fn")).toBe("function");
    expect(inspectDict("en").get("audit.fn")).toBe("string");
    expect(readDict("en")).not.toContain(`: ${NEW_FUNCTION_VALUE},`);
  });

  it("updateEntry: 새 키 이름에 코드를 넣어도 문자열 리터럴 키로만 기록한다", async () => {
    await dict.updateEntry({
      oldKey: "common.save",
      newKey: INJECTION_KEY,
      source: "project",
      values: { ko: "저장" },
    });

    const entries = inspectDict("ko");
    expect(entries.get(INJECTION_KEY)).toBe("string");
    expect(entries.has("common.save")).toBe(false);
  });

  it("updateEntry: 키 이름만 바꾸면 사전 파일에 있던 함수 값은 그대로 유지한다", async () => {
    const values = Object.fromEntries(
      i18n.supportedLocales.map((locale) => {
        const entry = dict.loadProjectDict(locale).entries.find((e) => e.key === "common.results");
        return [locale, entry?.value ?? ""];
      }),
    );

    await dict.updateEntry({
      oldKey: "common.results",
      newKey: "common.count",
      source: "project",
      values,
    });

    expect(inspectDict("ko").get("common.count")).toBe("function");
    expect(inspectDict("en").get("common.count")).toBe("function");
    expect(inspectDict("ko").has("common.results")).toBe(false);
  });
});

describe("SonamuDictionary Excel import는 외부 키를 코드로 쓰지 않는다", () => {
  it("코드를 넣은 키는 문자열 리터럴 키로, 내보낸 그대로의 함수 값은 기존 함수로 기록한다", async () => {
    const buffer = buildXlsx([
      [INJECTION_KEY, "project", "v", "v"],
      [
        "common.results",
        "project",
        "(count: number) => `${count}개 결과`",
        "(count: number) => `${count} results`",
      ],
    ]);

    await dict.importFromExcel(buffer);

    for (const locale of i18n.supportedLocales) {
      const entries = inspectDict(locale);
      expect(entries.get(INJECTION_KEY)).toBe("string");
      expect(entries.get("common.results")).toBe("function");
    }
  });
});
