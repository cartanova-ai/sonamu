import fs from "fs";
import path from "path";
import { Sonamu } from "../../api/sonamu";
import { EntityManager, type EntityNamesRecord } from "../../entity/entity-manager";
import type { TemplateOptions } from "../../types/types";
import { Template } from "../template";

/**
 * Sonamu Dictionary (SD) 템플릿
 * i18n을 위한 sd.generated.ts 파일을 생성합니다.
 */
export class Template__sd extends Template {
  constructor() {
    super("sd");
  }

  getTargetAndPath(_names?: EntityNamesRecord, sdTarget?: "api" | "web" | "app") {
    const target = sdTarget ?? "api";
    // api.dir은 상대 경로("api")이므로, web/app도 상대 경로로 맞춤
    const dir = target === "api" ? Sonamu.config.api.dir : target;

    return {
      target: `${dir}/src/i18n`,
      path: "sd.generated.ts",
    };
  }

  render(options: TemplateOptions["sd"]) {
    const { target } = options;
    const i18nConfig = Sonamu.config.i18n ?? {
      defaultLocale: "ko",
      supportedLocales: ["ko"],
    };

    const { defaultLocale, supportedLocales } = i18nConfig;

    // entity.json에서 entity labels 추출
    const entityLabels = this.extractEntityLabels();

    // 플랫폼별 locale 관리 코드
    const localeManagementCode =
      target === "api"
        ? `
import { Sonamu } from "sonamu";

const DEFAULT_LOCALE = "${defaultLocale}";
const SUPPORTED_LOCALES = ${JSON.stringify(supportedLocales)};
function getCurrentLocale(): string {
  const ctx = Sonamu.getContext();
  return ctx?.locale ?? DEFAULT_LOCALE;
}
`.trim()
        : `
const DEFAULT_LOCALE = "${defaultLocale}";
const SUPPORTED_LOCALES = ${JSON.stringify(supportedLocales)};
let _currentLocale = DEFAULT_LOCALE;

export function setLocale(locale: string) {
  _currentLocale = locale;
}

export function getCurrentLocale(): string {
  return _currentLocale;
}
`.trim();

    // sonamuDict를 소스 파일에서 파싱하여 코드로 변환 (타입 정보 보존)
    const sonamuDictKoCode = this.generateDictCodeFromSource("sonamuDictKo", "ko");
    const sonamuDictEnCode = this.generateDictCodeFromSource("sonamuDictEn", "en");

    // locale import
    const localeImports = supportedLocales
      .map((locale) => `import ${locale} from "./${locale}";`)
      .join("\n");

    // entityLabels를 코드로 변환
    const entityLabelsCode = this.generateEntityLabelsCode(entityLabels);

    const body = `
${localeManagementCode}

${localeImports}

// entity.json에서 추출한 entity labels (defaultLocale 전용)
${entityLabelsCode}

${sonamuDictKoCode}
${sonamuDictEnCode}

// defaultLocale의 dictionary를 기준으로 키 추출
type ProjectDictionary = typeof ${defaultLocale};
type SonamuDictionary = typeof sonamuDict${this.capitalize(defaultLocale)};
type EntityLabels = typeof entityLabels;
type RawMergedDictionary = EntityLabels & SonamuDictionary & ProjectDictionary;

// 키는 유지하되, 값 타입은 string 또는 함수로 일반화 (다른 locale의 리터럴 타입 충돌 방지)
type MergedDictionary = {
  [K in keyof RawMergedDictionary]: RawMergedDictionary[K] extends (...args: infer P) => string
    ? (...args: P) => string
    : string;
};
type DictKey = keyof MergedDictionary;
export type LocalizedString = string & { __brand: "LocalizedString" };

export function defineLocale(dict: Partial<MergedDictionary>) {
  return dict;
}

// 각 locale별로 entity labels + Sonamu 내장 dict + 프로젝트 dict 합침
const dictionaries: Record<string, Partial<MergedDictionary>> = {
  ${defaultLocale}: { ...sonamuDict${this.capitalize(defaultLocale)}, ...entityLabels, ...${defaultLocale} },
  ${supportedLocales
    .filter((locale) => locale !== defaultLocale)
    .map((locale) => `  ${locale}: { ...sonamuDict${this.capitalize(locale)}, ...${locale} },`)
    .join("\n")}
};

type SDReturnType<K extends DictKey> = MergedDictionary[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  const dict = dictionaries[locale];
  const value = dict?.[key] ?? dictionaries[DEFAULT_LOCALE]?.[key] ?? key;
  return value as unknown as SDReturnType<K>;
}

/**
 * Sonamu Dictionary 함수
 * locale에 맞는 번역 텍스트를 반환합니다.
 *
 * @example
 * SD("common.save")  // → "저장" (LocalizedString)
 * SD("user.notFound")(1)  // → "존재하지 않는 User ID 1" (LocalizedString)
 */
export function SD<K extends DictKey>(key: K): SDReturnType<K> {
  const locale = getCurrentLocale();
  return getDictValue(key, locale);
}

/**
 * 특정 locale의 번역 텍스트를 반환하는 함수를 생성합니다.
 *
 * @example
 * const EN = SD.locale("en");
 * EN("common.save")  // → "Save"
 */
SD.locale = (locale: string) => <K extends DictKey>(key: K): SDReturnType<K> => {
  return getDictValue(key, locale);
};

/**
 * locale에 따라 적절한 컬럼 값을 반환합니다.
 * DB에 name, name_ko, name_en처럼 localized column이 있을 때 사용합니다.
 *
 * 우선순위 (ko locale): column_ko → column → column_en
 * 우선순위 (en locale): column_en → column → column_ko
 *
 * @example
 * localizedColumn(tag, "name")
 */
export function localizedColumn<T extends Record<string, unknown>, K extends keyof T & string>(
  row: T,
  column: K,
): string | undefined {
  const locale = getCurrentLocale();
  const otherLocales = SUPPORTED_LOCALES.filter((l: string) => l !== locale);
  const localizedKey = (column: K, locale: string) => \`\${String(column)}_\${locale}\`;
  const keys = [localizedKey(column, locale), column, ...otherLocales.map((l) => localizedKey(column, l))];

  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== "") {
      return String(value);
    }
  }

  return undefined;
}

/**
 * Enum의 localized labels를 Proxy로 반환합니다.
 * Select 컴포넌트 등에서 EnumLabel[key] 대신 사용합니다.
 *
 * @example
 * SD.enumLabels("TagOrderBy")[key]  // → 현재 locale의 라벨
 */
SD.enumLabels = (enumName: string): Record<string, LocalizedString> => {
  return new Proxy({} as Record<string, LocalizedString>, {
    get(_, key: string) {
      const dictKey = \`enum.\${enumName}.\${key}\` as DictKey;
      return getDictValue(dictKey, getCurrentLocale());
    }
  });
};
`.trim();

    return {
      ...this.getTargetAndPath(undefined, target),
      body,
      importKeys: [],
      customHeaders: [],
    };
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * 모든 entity.json에서 entity labels 추출
   * entity.json에서 직접 관리되는 값만 포함 (자동 생성 값 제외)
   * - entity.{entityId}: entity title
   * - entity.{entityId}.{propName}: prop desc
   * - enum.{EnumId}.{value}: enum label
   */
  private extractEntityLabels(): { key: string; value: string }[] {
    const labels: { key: string; value: string }[] = [];

    if (!EntityManager.isAutoloaded) {
      return labels;
    }

    const entityIds = EntityManager.getAllIds();

    for (const entityId of entityIds) {
      const entity = EntityManager.get(entityId);

      // entity title (entity.json에서 관리)
      labels.push({ key: `entity.${entityId}`, value: entity.title });

      // prop labels (entity.json에서 관리)
      for (const prop of entity.props) {
        if (prop.desc) {
          labels.push({ key: `entity.${entityId}.${prop.name}`, value: prop.desc });
        }
      }

      // enum labels (entity.json에서 관리)
      for (const [enumId, enumLabelsMap] of Object.entries(entity.enumLabels)) {
        for (const [value, label] of Object.entries(enumLabelsMap)) {
          labels.push({ key: `enum.${enumId}.${value}`, value: label });
        }
      }
    }

    return labels;
  }

  /**
   * entityLabels를 TypeScript 코드로 변환
   */
  private generateEntityLabelsCode(labels: { key: string; value: string }[]): string {
    if (labels.length === 0) {
      return "const entityLabels = {} as const;";
    }

    const entries = labels.map(({ key, value }) => `  "${key}": "${this.escapeString(value)}",`);

    return `const entityLabels = {
${entries.join("\n")}
} as const;`;
  }

  private escapeString(str: string): string {
    return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }

  /**
   * sonamu dict 소스 파일을 읽어 파싱하고 코드로 변환
   * 런타임 toString()이 아닌 소스 파싱으로 타입 정보 보존
   */
  private generateDictCodeFromSource(varName: string, locale: string): string {
    // sonamu 패키지 루트에서 src/dict 경로 찾기
    // __dirname이 dist/template/implementations일 수 있으므로 패키지 루트 기준으로 접근
    const packageRoot = path.resolve(import.meta.dirname, "..", "..", "..");
    const dictPath = path.join(packageRoot, "src", "dict", `${locale}.ts`);

    if (!fs.existsSync(dictPath)) {
      return `const ${varName} = {};`;
    }

    const content = fs.readFileSync(dictPath, "utf-8");

    // export default { ... } as const; 패턴 매칭
    const objectMatch = content.match(/export\s+default\s*\{([\s\S]*)\}\s*as\s*const/);
    if (!objectMatch) {
      return `const ${varName} = {};`;
    }

    const objectContent = objectMatch[1];
    const entries = this.parseDictObject(objectContent);

    if (entries.length === 0) {
      return `const ${varName} = {};`;
    }

    const entryLines = entries.map(({ key, value }) => `  "${key}": ${value},`);

    return `const ${varName} = {
${entryLines.join("\n")}
};`;
  }

  /**
   * dict 객체 내용을 파싱하여 key-value 추출
   * 함수의 경우 원본 소스 그대로 보존 (타입 포함)
   */
  private parseDictObject(objectContent: string): { key: string; value: string }[] {
    const entries: { key: string; value: string }[] = [];
    const seenKeys = new Set<string>();

    // 함수 원형 패턴 먼저 처리 (우선순위 높음)
    // "key": (params: type) => `template` 또는 key: (params: type) => `template`
    // 다중 줄 함수도 처리하기 위해 [\s\S]로 줄바꿈 허용
    const functionPattern =
      /(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_.]*)):\s*(\([^)]*\)\s*=>[\s]*(?:`[^`]*`|"[^"]*"))/g;
    for (const match of objectContent.matchAll(functionPattern)) {
      const key = match[1] ?? match[2];
      // 다중 줄 함수를 한 줄로 정규화 (불필요한 공백/줄바꿈 제거)
      const value = match[3].replace(/\s*\n\s*/g, " ");
      entries.push({ key, value });
      seenKeys.add(key);
    }

    // 문자열 값 패턴: "key": "value" 또는 key: `value`
    const stringPattern = /(?:"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_.]*)):\s*(?:"([^"]*?)"|`([^`]*?)`)/g;
    for (const match of objectContent.matchAll(stringPattern)) {
      const key = match[1] ?? match[2];
      // 이미 함수로 처리된 키는 스킵
      if (seenKeys.has(key)) continue;

      const stringValue = match[3] ?? match[4];
      // 화살표 함수 패턴이 아닌 경우만
      const lineStart = objectContent.lastIndexOf("\n", match.index ?? 0);
      const lineEnd = objectContent.indexOf("\n", (match.index ?? 0) + match[0].length);
      const fullLine = objectContent.slice(lineStart, lineEnd > -1 ? lineEnd : undefined);
      if (!fullLine.includes("=>")) {
        // 문자열은 따옴표로 감싸서 반환
        entries.push({ key, value: `"${this.escapeString(stringValue)}"` });
      }
    }

    return entries;
  }
}
