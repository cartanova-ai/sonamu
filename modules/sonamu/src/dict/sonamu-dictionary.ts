import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { Workbook } from "@sheetkit/node";
import ts from "typescript";

import { Sonamu } from "../api/sonamu";
import { EntityManager } from "../entity/entity-manager";
import { BadRequestException } from "../exceptions/so-exceptions";
import { formatCode } from "../utils/formatter";
import { SD } from "./sd";
import {
  type DictEntry,
  type DictionaryResult,
  type DictionaryRow,
  type EntityKeyInfo,
  type I18nConfig,
  type ImportResult,
  type UsageResult,
} from "./types";

/**
 * 0-based 컬럼 인덱스를 엑셀 컬럼 문자로 변환 (0 -> "A", 25 -> "Z", 26 -> "AA")
 */
function colLetter(index: number): string {
  let result = "";
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Sonamu Dictionary 관리 클래스
 * i18n 딕셔너리의 CRUD 및 Excel import/export를 담당합니다.
 */
export class SonamuDictionary {
  /**
   * TypeScript Compiler API를 사용하여 dict 파일 파싱
   *
   * 지원 패턴:
   * - export default { ... } as const;
   * - export default defineLocale({ ... });
   * - 문자열 값: "key": "value" 또는 key: `value`
   * - 함수 값: "key": (param: Type) => `template`
   */
  parseDictFile(filePath: string): DictEntry[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const entries: DictEntry[] = [];

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isExportAssignment(node)) {
        const objectLiteral = this.unwrapToObjectLiteral(node.expression);
        if (objectLiteral) {
          this.extractEntriesFromObject(objectLiteral, sourceFile, entries);
        }
      }
    });

    return entries;
  }

  /**
   * 파일에서 특정 이름의 const 선언을 찾아 ObjectLiteral 파싱
   * 예: const entityLabels = { ... } as const;
   */
  parseConstObjectDeclaration(filePath: string, varName: string): DictEntry[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    const entries: DictEntry[] = [];

    ts.forEachChild(sourceFile, (node) => {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === varName && decl.initializer) {
            const objectLiteral = this.unwrapToObjectLiteral(decl.initializer);
            if (objectLiteral) {
              this.extractEntriesFromObject(objectLiteral, sourceFile, entries);
            }
          }
        }
      }
    });

    return entries;
  }

  /**
   * 문자열이 화살표 함수 또는 함수 표현식인지 판별
   */
  isExpressionFunction(code: string): boolean {
    // 빈 문자열이나 공백만 있는 경우
    if (!code.trim()) {
      return false;
    }

    const ARROW_FUNCTION_PATTERN = /^\s*\([^)]*\)\s*=>/;

    return ARROW_FUNCTION_PATTERN.test(code);
  }

  /**
   * export default 표현식에서 ObjectLiteralExpression 추출
   * - as const 처리
   * - defineLocale({ ... }) 호출 처리
   */
  private unwrapToObjectLiteral(expr: ts.Expression): ts.ObjectLiteralExpression | null {
    // as const 처리
    if (ts.isAsExpression(expr)) {
      return this.unwrapToObjectLiteral(expr.expression);
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
   * ObjectLiteralExpression에서 DictEntry 추출
   */
  private extractEntriesFromObject(
    objectLiteral: ts.ObjectLiteralExpression,
    sourceFile: ts.SourceFile,
    entries: DictEntry[],
  ): void {
    for (const prop of objectLiteral.properties) {
      const entry = this.extractDictEntry(prop, sourceFile);
      if (entry) {
        entries.push(entry);
      }
    }
  }

  /**
   * PropertyName에서 키 문자열 추출
   * - 문자열 리터럴: "key"
   * - 식별자: key (unquoted)
   */
  private getPropertyKey(name: ts.PropertyName): string | null {
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
  private extractDictEntry(
    prop: ts.ObjectLiteralElementLike,
    sourceFile: ts.SourceFile,
  ): DictEntry | null {
    if (!ts.isPropertyAssignment(prop)) {
      return null;
    }

    const key = this.getPropertyKey(prop.name);
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

  /**
   * 프로젝트의 i18n dict 파일 경로를 반환합니다.
   * @param locale - 로케일 (ko, en 등)
   * @param target - 타겟 디렉토리 (api, web, app)
   */
  getProjectDictPath(locale: string, target: "api" | "web" | "app" = "api"): string {
    const dir = target === "api" ? Sonamu.config.api.dir : target;
    return path.join(Sonamu.appRootPath, dir, "src", "i18n", `${locale}.ts`);
  }

  /**
   * sonamu 내장 dict 파일 경로를 반환합니다.
   */
  private getSonamuDictPath(locale: string): string {
    const packageRoot = path.resolve(import.meta.dirname, "..", "..");
    return path.join(packageRoot, "src", "dict", `${locale}.ts`);
  }

  /**
   * 필요한 dict 키가 프로젝트에 존재하는지 확인하고, 없으면 추가합니다.
   * defaultLocale에만 추가하며, 다른 locale은 사용자가 직접 번역해야 합니다.
   *
   * @param requiredKeys - 필요한 키 목록
   * @param target - 타겟 디렉토리 (api, web, app)
   * @returns 추가된 키 목록
   */
  async ensureDictKeys(
    requiredKeys: string[],
    target: "api" | "web" | "app" = "api",
  ): Promise<string[]> {
    const { defaultLocale } = Sonamu.config.i18n;
    const projectDictPath = this.getProjectDictPath(defaultLocale, target);

    // 프로젝트 dict 파일이 없으면 아무것도 하지 않음
    if (!fs.existsSync(projectDictPath)) {
      return [];
    }

    // 프로젝트 dict에서 기존 키 파싱
    const projectEntries = this.parseDictFile(projectDictPath);
    const existingKeys = new Set(projectEntries.map((e) => e.key));

    // 누락된 키 찾기
    const missingKeys = requiredKeys.filter((key) => !existingKeys.has(key));

    if (missingKeys.length === 0) {
      return [];
    }

    // sonamu dict에서 기본값 가져오기
    const sonamuDictPath = this.getSonamuDictPath(defaultLocale);
    if (!fs.existsSync(sonamuDictPath)) {
      return [];
    }

    const sonamuEntries = this.parseDictFile(sonamuDictPath);
    const sonamuDict = new Map(sonamuEntries.map((e) => [e.key, e]));

    // 추가할 엔트리 생성
    const entriesToAdd = missingKeys
      .map((key) => sonamuDict.get(key))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

    if (entriesToAdd.length === 0) {
      return [];
    }

    // 프로젝트 dict 파일에 추가
    await this.appendEntriesToDictFile(projectDictPath, entriesToAdd, defaultLocale, true);

    return entriesToAdd.map((e) => e.key);
  }

  /**
   * dict 파일에 엔트리를 추가합니다.
   * 기존 파일을 파싱하고, 새 엔트리를 추가한 뒤, 전체 파일을 재생성합니다.
   */
  private async appendEntriesToDictFile(
    filePath: string,
    entries: DictEntry[],
    locale: string,
    isDefaultLocale: boolean,
  ): Promise<void> {
    // 기존 entries 파싱
    const existingEntries = this.parseDictFile(filePath);

    // 새 entries 추가
    for (const entry of entries) {
      existingEntries.push(entry);
    }

    // 파일 재생성
    const content = this.generateProjectDict(locale, existingEntries, isDefaultLocale);
    const formatted = await formatCode(content, filePath);
    fs.writeFileSync(filePath, formatted, "utf-8");
  }

  /**
   * 함수 값들에서 사용되는 헬퍼 함수를 감지합니다.
   */
  private detectUsedHelpers(entries: DictEntry[]) {
    const functionEntries = entries.filter((e) => e.isFunction);
    const helpers: string[] = [];

    for (const helper of ["plural", "josa"]) {
      // 함수명이 단어 경계로 사용되는지 확인 (예: plural( 또는 plural,)
      const pattern = new RegExp(`\\b${helper}\\s*\\(`);
      if (functionEntries.some((e) => pattern.test(e.value))) {
        helpers.push(helper);
      }
    }

    // format 사용 여부 별도 감지 (format.number(...), format.date(...) 등)
    const formatPattern = /\bformat\.\w+\s*\(/;
    const usesFormat = functionEntries.some((e) => formatPattern.test(e.value));

    return { helpers, usesFormat };
  }

  /**
   * Project dict 파일 생성
   */
  generateProjectDict(locale: string, entries: DictEntry[], isDefaultLocale: boolean): string {
    // key 알파벳 순 정렬
    const sorted = [...entries].toSorted((a, b) => a.key.localeCompare(b.key));

    const lines: string[] = [];

    // 함수 값에서 사용되는 헬퍼 함수 감지
    const { helpers, usesFormat } = this.detectUsedHelpers(entries);

    // 헬퍼 함수 import 추가
    const imports = [...helpers];
    if (usesFormat) {
      imports.push("createFormat");
    }
    if (imports.length > 0) {
      lines.push(`import { ${imports.join(", ")} } from "sonamu/dict";`);
    }

    if (!isDefaultLocale) {
      lines.push('import { defineLocale } from "./sd.generated";');
    }

    if (imports.length > 0 || !isDefaultLocale) {
      lines.push("");
    }

    // format 사용 시 createFormat 호출 추가
    if (usesFormat) {
      lines.push(`const format = createFormat("${locale}");`);
      lines.push("");
    }

    lines.push("/**");
    lines.push(` * Project ${locale.toUpperCase()} Dictionary`);
    lines.push(" */");

    if (isDefaultLocale) {
      lines.push("export default {");
    } else {
      lines.push("export default defineLocale({");
    }

    for (const entry of sorted) {
      if (entry.isFunction) {
        // 함수인 경우: 원형 그대로 출력
        lines.push(`  "${entry.key}": ${entry.value},`);
      } else {
        lines.push(`  "${entry.key}": ${JSON.stringify(entry.value)},`);
      }
    }

    if (isDefaultLocale) {
      lines.push("} as const;");
    } else {
      lines.push("});");
    }
    lines.push("");

    return lines.join("\n");
  }

  /**
   * i18n 설정을 가져옵니다.
   */
  private getI18nConfig(): I18nConfig {
    return Sonamu.config.i18n;
  }

  /**
   * i18n 디렉토리 경로를 반환하고, 없으면 생성합니다.
   */
  private ensureI18nDir(): string {
    const i18nDir = path.join(Sonamu.apiRootPath, "src", "i18n");
    if (!fs.existsSync(i18nDir)) {
      fs.mkdirSync(i18nDir, { recursive: true });
    }
    return i18nDir;
  }

  /**
   * dict 파일을 저장합니다.
   */
  private async saveDictFile(
    locale: string,
    entries: DictEntry[],
    isDefaultLocale: boolean,
  ): Promise<void> {
    const i18nDir = this.ensureI18nDir();
    const dictPath = path.join(i18nDir, `${locale}.ts`);
    const content = this.generateProjectDict(locale, entries, isDefaultLocale);
    const formatted = await formatCode(content, dictPath);
    fs.writeFileSync(dictPath, formatted, "utf-8");
  }

  /**
   * i18n key를 파싱하여 entity 관련 정보 추출
   */
  parseEntityKey(key: string): EntityKeyInfo {
    // entity.{EntityId} (list, create, edit 제외)
    const entityTitleMatch = key.match(/^entity\.([A-Z][a-zA-Z0-9]*)$/);
    if (
      entityTitleMatch &&
      !key.includes(".list") &&
      !key.includes(".create") &&
      !key.includes(".edit")
    ) {
      return { type: "entityTitle", entityId: entityTitleMatch[1] };
    }

    // entity.{EntityId}.{propName}
    const propDescMatch = key.match(/^entity\.([A-Z][a-zA-Z0-9]*)\.([a-z_][a-z0-9_]*)$/);
    if (propDescMatch) {
      return { type: "propDesc", entityId: propDescMatch[1], propName: propDescMatch[2] };
    }

    // enum.{EnumId}.{value}
    const enumLabelMatch = key.match(/^enum\.([A-Z][a-zA-Z0-9]*)\.(.+)$/);
    if (enumLabelMatch) {
      return { type: "enumLabel", enumId: enumLabelMatch[1], enumValue: enumLabelMatch[2] };
    }

    return { type: "other" };
  }

  /**
   * entity key에 대해 entity.json 업데이트 수행
   * @returns 업데이트 여부
   */
  async updateEntityByKey(key: string, value: string): Promise<boolean> {
    const keyInfo = this.parseEntityKey(key);

    switch (keyInfo.type) {
      case "entityTitle": {
        try {
          const entity = EntityManager.get(keyInfo.entityId);
          if (entity.title !== value) {
            entity.title = value;
            await entity.save();
            return true;
          }
        } catch {
          // entity not found
        }
        return false;
      }

      case "propDesc": {
        try {
          const entity = EntityManager.get(keyInfo.entityId);
          const propIndex = entity.props.findIndex((p) => p.name === keyInfo.propName);
          if (propIndex !== -1 && entity.props[propIndex].desc !== value) {
            entity.props[propIndex].desc = value;
            await entity.save();
            return true;
          }
        } catch {
          // entity not found
        }
        return false;
      }

      case "enumLabel": {
        for (const entityId of EntityManager.getAllIds()) {
          const entity = EntityManager.get(entityId);
          if (entity.enumLabels[keyInfo.enumId]) {
            if (entity.enumLabels[keyInfo.enumId][keyInfo.enumValue] !== value) {
              entity.enumLabels[keyInfo.enumId][keyInfo.enumValue] = value;
              await entity.save();
              return true;
            }
            break;
          }
        }
        return false;
      }

      default:
        return false;
    }
  }

  /**
   * sd.generated.ts에서 entity labels 추출
   * entity.json에서 관리되는 값만 포함 (.list, .create, .edit 제외)
   */
  extractEntityLabels(): DictEntry[] {
    const sdPath = path.join(Sonamu.apiRootPath, "src", "i18n", "sd.generated.ts");
    if (!fs.existsSync(sdPath)) {
      return [];
    }

    return this.parseConstObjectDeclaration(sdPath, "entityLabels");
  }

  /**
   * sd.generated.ts에서 rc-keys 추출
   * react-components에서 관리되는 i18n 키들
   * @param locale - 로케일 (ko, en 등)
   */
  extractRCKeys(locale: string): DictEntry[] {
    const sdPath = path.join(Sonamu.apiRootPath, "src", "i18n", "sd.generated.ts");
    if (!fs.existsSync(sdPath)) {
      return [];
    }

    // locale별 변수명 매핑 (sd.template.ts의 getRCKeysVarName과 동일)
    const varName = (() => {
      if (locale === "ko") return "rcKeysKo";
      if (locale === "en") return "rcKeysEn";
      // 다른 locale은 en을 fallback으로 사용
      return "rcKeysEn";
    })();

    return this.parseConstObjectDeclaration(sdPath, varName);
  }

  /**
   * Project dict 파일([locale].ts)에서 딕셔너리 로드
   */
  loadProjectDict(locale: string) {
    const dictPath = path.join(Sonamu.apiRootPath, "src", "i18n", `${locale}.ts`);
    if (!fs.existsSync(dictPath)) {
      return { entries: [] };
    }
    return { entries: this.parseDictFile(dictPath) };
  }

  /**
   * 딕셔너리 데이터 수집 (sonamu + entity + project)
   */
  async collectDictionary(): Promise<DictionaryResult> {
    const { defaultLocale, supportedLocales } = this.getI18nConfig();
    const locales = supportedLocales;

    const rows: DictionaryRow[] = [];
    const rowMap = new Map<string, DictionaryRow>();

    // 1. RC Keys (sonamu source, 각 locale별)
    for (const locale of locales) {
      const rcKeys = this.extractRCKeys(locale);
      for (const rcKey of rcKeys) {
        let row = rowMap.get(rcKey.key);
        if (!row) {
          row = {
            key: rcKey.key,
            source: "sonamu",
            isFunction: rcKey.isFunction ?? false,
          };
          rowMap.set(rcKey.key, row);
        }
        row[locale] = rcKey.value;
        if (rcKey.isFunction) {
          row.isFunction = true;
        }
      }
    }

    // 2. Entity labels (default locale 기준)
    const entityLabels = this.extractEntityLabels();
    for (const label of entityLabels) {
      const row: DictionaryRow = {
        key: label.key,
        source: "entity",
        isFunction: label.isFunction ?? false,
        [defaultLocale]: label.value,
      };
      rowMap.set(label.key, row);
    }

    // 3. Project dict (각 locale별)
    for (const locale of locales) {
      const { entries } = this.loadProjectDict(locale);
      for (const entry of entries) {
        const existing = rowMap.get(entry.key);
        if (existing) {
          // sonamu, entity source가 있으면 해당 locale 값만 추가
          existing[locale] = entry.value;
          if (entry.isFunction) {
            existing.isFunction = true;
          }
        } else {
          // project source로 새로 추가
          let row = rowMap.get(entry.key);
          if (!row) {
            row = {
              key: entry.key,
              source: "project",
              isFunction: entry.isFunction,
            };
            rowMap.set(entry.key, row);
          }
          row[locale] = entry.value;
        }
      }
    }

    rows.push(...rowMap.values());
    rows.sort((a, b) => a.key.localeCompare(b.key));

    // 통계 계산: locale별 (채워진 값 / 전체 키 수)
    const stats: Record<string, { total: number; filled: number; percent: number }> = {};
    const total = rows.length;
    for (const locale of locales) {
      const filled = rows.filter((row) => !!row[locale]).length;
      const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
      stats[locale] = { total, filled, percent };
    }

    return { rows, locales, defaultLocale, stats };
  }

  /**
   * 딕셔너리 조회
   */
  async getDictionary(): Promise<DictionaryResult> {
    return this.collectDictionary();
  }

  /**
   * Excel로 내보내기
   */
  async exportToExcel(): Promise<{ filename: string; buffer: Buffer }> {
    const { rows, locales } = await this.collectDictionary();

    const wb = new Workbook();
    const sheet = "i18n";
    wb.setSheetName("Sheet1", sheet);

    const projectName = `${Sonamu.config.projectName ?? "Sonamu"} Dictionary`;
    const headers = ["key", "source", ...locales];

    // 스타일 정의
    const titleStyleId = wb.addStyle({
      font: { size: 23 },
      alignment: { vertical: "center", horizontal: "left" },
    });
    const headerStyleId = wb.addStyle({
      font: { bold: true, size: 11 },
      alignment: { horizontal: "center", vertical: "center" },
      fill: { pattern: "solid", fgColor: "F1F1F1" },
      border: {
        top: { style: "thin", color: "D0D0D0" },
        left: { style: "thin", color: "D0D0D0" },
        bottom: { style: "thin", color: "D0D0D0" },
        right: { style: "thin", color: "D0D0D0" },
      },
    });
    const dataStyleId = wb.addStyle({
      font: { size: 11 },
      alignment: { vertical: "center", horizontal: "left" },
    });

    // 행 1: 프로젝트명
    wb.setCellValue(sheet, "A1", projectName);
    wb.setCellStyle(sheet, "A1", titleStyleId);
    wb.setRowHeight(sheet, 1, 28);

    // 행 2: 빈 행 (기본값)

    // 행 3: 헤더
    wb.setRowValues(sheet, 3, "A", headers);
    wb.setRowHeight(sheet, 3, 26);
    for (let col = 0; col < headers.length; col++) {
      wb.setCellStyle(sheet, `${colLetter(col)}3`, headerStyleId);
    }

    // 행 4 이후: 데이터
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const values = [row.key, row.source, ...locales.map((locale) => row[locale] ?? "")];
      const rowNum = i + 4;
      wb.setRowValues(sheet, rowNum, "A", values);
      wb.setRowHeight(sheet, rowNum, 24);
      for (let col = 0; col < values.length; col++) {
        wb.setCellStyle(sheet, `${colLetter(col)}${rowNum}`, dataStyleId);
      }
    }

    // 컬럼 너비 계산
    const MAX_WIDTH = 50;
    const MIN_WIDTH = 10;
    const columnWidths: number[] = headers.map((header) => Math.max(header.length, MIN_WIDTH));

    for (const row of rows) {
      const values = [row.key, row.source, ...locales.map((locale) => row[locale] ?? "")];
      values.forEach((value, idx) => {
        const textLength = String(value).length;
        columnWidths[idx] = Math.min(Math.max(columnWidths[idx], textLength), MAX_WIDTH);
      });
    }

    // 컬럼 너비 적용
    for (let col = 0; col < columnWidths.length; col++) {
      wb.setColWidth(sheet, colLetter(col), columnWidths[col] + 2);
    }

    return {
      filename: `${projectName}-${new Date().toISOString().split("T")[0]}.xlsx`,
      buffer: wb.writeBufferSync(),
    };
  }

  /**
   * Excel에서 가져오기
   *
   * 형식:
   * - 1행: 프로젝트명
   * - 2행: 빈 행
   * - 3행: 헤더 (key, source, locales...)
   * - 4행 이후: 데이터
   */
  async importFromExcel(buffer: Buffer): Promise<ImportResult> {
    const wb = Workbook.openBufferSync(buffer);
    const sheet = wb.sheetNames[0];
    const allRows = wb.getRows(sheet);

    const { defaultLocale, supportedLocales } = this.getI18nConfig();
    const locales = supportedLocales;

    let updatedEntities = 0;
    let updatedLocales = 0;

    // locale별 project dict entries
    const projectDictEntries: Record<string, DictEntry[]> = {};
    for (const locale of locales) {
      projectDictEntries[locale] = [];
    }

    // 헤더 행 찾기: 첫 번째 컬럼(A)이 "key"인 행
    let headerRowNum = 0;
    for (const rowData of allRows) {
      const firstCell = rowData.cells.find((c) => c.column === "A");
      const firstCellValue = String(firstCell?.value ?? "")
        .trim()
        .toLowerCase();
      if (firstCellValue === "key") {
        headerRowNum = rowData.row;
        break;
      }
    }

    if (headerRowNum === 0) {
      throw new BadRequestException(SD("sonamu.error.headerRowNotFound"));
    }

    // 헤더 행에서 컬럼 매핑 구성
    const headerRowData = allRows.find((r) => r.row === headerRowNum);
    const colToHeader: Map<string, string> = new Map();
    if (headerRowData) {
      for (const cell of headerRowData.cells) {
        colToHeader.set(cell.column, String(cell.value ?? ""));
      }
    }

    // 데이터 행 읽기 (헤더 다음 행부터)
    for (const rowData of allRows) {
      if (rowData.row <= headerRowNum) continue;

      const rowValues: Record<string, string> = {};
      for (const cell of rowData.cells) {
        const headerName = colToHeader.get(cell.column);
        if (headerName) {
          rowValues[headerName] = String(cell.value ?? "");
        }
      }

      const key = rowValues.key;
      const source =
        /* SAFETY: 동기화된 사전 키와 값 계약이 이 값의 타입을 보장한다. */ rowValues.source as
          | "entity"
          | "project";

      if (!key || !source) continue;

      if (source === "entity") {
        // entity source: default locale만 entity.json에 저장
        const defaultValue = rowValues[defaultLocale];
        if (defaultValue) {
          const updated = await this.updateEntityByKey(key, defaultValue);
          if (updated) {
            updatedEntities++;
          }
        }

        // non-default locale은 project dict에 저장
        for (const locale of locales) {
          if (locale === defaultLocale) continue;
          const cellValue = rowValues[locale]?.trim();
          if (cellValue) {
            projectDictEntries[locale].push({
              key,
              value: cellValue,
              isFunction: this.isExpressionFunction(cellValue),
            });
          }
        }
      } else if (source === "project") {
        // project source: 모든 locale을 project dict에 저장
        for (const locale of locales) {
          const cellValue = rowValues[locale]?.trim();
          if (cellValue) {
            projectDictEntries[locale].push({
              key,
              value: cellValue,
              isFunction: this.isExpressionFunction(cellValue),
            });
          }
        }
      }
    }

    // Project dict 파일 생성
    for (const locale of locales) {
      const entries = projectDictEntries[locale];
      if (entries.length > 0) {
        await this.saveDictFile(locale, entries, locale === defaultLocale);
        updatedLocales++;
      }
    }

    return {
      success: true,
      updatedEntities,
      updatedLocales,
    };
  }

  /**
   * 딕셔너리 항목 수정
   */
  async updateEntry(params: {
    oldKey: string;
    newKey: string;
    source: "entity" | "project" | "sonamu";
    values: Record<string, string>;
  }): Promise<void> {
    const { oldKey, newKey, source, values } = params;

    const { defaultLocale, supportedLocales } = this.getI18nConfig();
    const locales = supportedLocales;

    // entity source의 default locale 처리
    if (source === "entity" && values[defaultLocale]) {
      await this.updateEntityByKey(newKey, values[defaultLocale]);
    }

    // project dict 업데이트
    // - entity의 non-default locale
    // - project source의 모든 locale
    // - sonamu source의 모든 locale (override)
    for (const locale of locales) {
      // entity source의 default locale은 entity.json에서 처리했으므로 스킵
      if (source === "entity" && locale === defaultLocale) continue;

      const cellValue = values[locale]?.trim();
      if (!cellValue) continue;

      // 기존 dict 로드
      const { entries } = this.loadProjectDict(locale);

      // key 변경 시 기존 key 제거
      if (oldKey !== newKey) {
        const oldIndex = entries.findIndex((e) => e.key === oldKey);
        if (oldIndex !== -1) {
          entries.splice(oldIndex, 1);
        }
      }

      // 새 값 업데이트 또는 추가
      const existingIndex = entries.findIndex((e) => e.key === newKey);
      const newEntry: DictEntry = {
        key: newKey,
        value: cellValue,
        isFunction: this.isExpressionFunction(cellValue),
      };

      if (existingIndex !== -1) {
        entries[existingIndex] = newEntry;
      } else {
        entries.push(newEntry);
      }

      // dict 파일 저장
      await this.saveDictFile(locale, entries, locale === defaultLocale);
    }
  }

  /**
   * 딕셔너리 항목 추가
   */
  async createEntry(params: { key: string; values: Record<string, string> }): Promise<void> {
    const { key, values } = params;

    if (!key?.trim()) {
      throw new BadRequestException(SD("sonamu.error.keyRequired"));
    }

    const { defaultLocale, supportedLocales } = this.getI18nConfig();
    const locales = supportedLocales;

    // 중복 키 체크
    for (const locale of locales) {
      const { entries } = this.loadProjectDict(locale);
      if (entries.some((e) => e.key === key)) {
        throw new BadRequestException(SD("sonamu.error.keyAlreadyExists")(key));
      }
    }

    // 각 locale에 새 키 추가
    for (const locale of locales) {
      const cellValue = values[locale]?.trim();
      if (!cellValue) continue;

      const { entries } = this.loadProjectDict(locale);
      entries.push({
        key,
        value: cellValue,
        isFunction: this.isExpressionFunction(cellValue),
      });

      await this.saveDictFile(locale, entries, locale === defaultLocale);
    }
  }

  /**
   * 딕셔너리 항목 삭제
   */
  async deleteEntry(key: string): Promise<void> {
    if (!key) {
      throw new BadRequestException(SD("sonamu.error.keyRequired"));
    }

    const { defaultLocale, supportedLocales } = this.getI18nConfig();
    const locales = supportedLocales;

    let deleted = false;
    for (const locale of locales) {
      const { entries } = this.loadProjectDict(locale);
      const index = entries.findIndex((e) => e.key === key);
      if (index !== -1) {
        entries.splice(index, 1);
        deleted = true;

        await this.saveDictFile(locale, entries, locale === defaultLocale);
      }
    }

    if (!deleted) {
      throw new BadRequestException(SD("sonamu.error.keyNotFound")(key));
    }
  }

  /**
   * 미사용 키 검사 (ast-grep 사용)
   */
  async checkUsage(keys: string[]): Promise<UsageResult> {
    // ast-grep 설치 확인
    let sgPath: string | null = null;
    try {
      sgPath = execSync("which sg", { encoding: "utf-8" }).trim();
    } catch {
      try {
        sgPath = execSync("which ast-grep", { encoding: "utf-8" }).trim();
      } catch {
        // ast-grep not installed
      }
    }

    if (!sgPath) {
      return {
        error:
          "ast-grep이 설치되어 있지 않습니다. brew install ast-grep 또는 npm install -g @ast-grep/cli로 설치해주세요.",
        unusedKeys: [],
      };
    }

    const searchPaths: string[] = [];
    for (const entry of ["api", "web", "app"]) {
      const srcPath = path.join(Sonamu.appRootPath, entry, "src");
      if (fs.existsSync(srcPath)) {
        searchPaths.push(srcPath);
      }
    }

    if (searchPaths.length === 0) {
      return {
        error: "검색할 src 디렉토리를 찾을 수 없습니다.",
        unusedKeys: [],
      };
    }

    const usedKeys = new Set<string>();

    try {
      // ast-grep으로 SD("...") 패턴 검색
      // 패턴: SD("KEY") 또는 SD('KEY') 형태
      const patterns = ['SD("$KEY")', "SD('$KEY')"];

      for (const searchPath of searchPaths) {
        for (const pattern of patterns) {
          try {
            const result = execSync(`${sgPath} --pattern '${pattern}' --json ${searchPath}`, {
              encoding: "utf-8",
              maxBuffer: 50 * 1024 * 1024, // 50MB
            });

            if (result.trim()) {
              const matches = JSON.parse(result);
              for (const match of matches) {
                // metaVariables.single.KEY.text에서 키 추출
                const keyText = match.metaVariables?.single?.KEY?.text;
                if (keyText) {
                  // 따옴표 제거
                  const cleanKey = keyText.replace(/^["']|["']$/g, "");
                  usedKeys.add(cleanKey);
                }
              }
            }
          } catch {
            // 패턴 매치 없으면 에러 (무시)
          }
        }
      }

      // keys 중에서 usedKeys에 없는 것들이 미사용 키
      const unusedKeys = keys.filter((k) => !usedKeys.has(k));

      return { unusedKeys, usedKeysCount: usedKeys.size };
    } catch (e) {
      return {
        error: `검색 중 오류 발생: ${e instanceof Error ? e.message : String(e)}`,
        unusedKeys: [],
      };
    }
  }
}

export const sonamuDictionary = new SonamuDictionary();
