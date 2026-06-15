import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Sonamu } from "../../api/sonamu";
import { EntityManager } from "../../entity/entity-manager";
import { type EntityNamesRecord } from "../../entity/entity-manager";
import { type TemplateOptions } from "../../types/types";
import { extractObjectDeclaration } from "../helpers";
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
    const i18nConfig = Sonamu.config.i18n;

    const { defaultLocale, supportedLocales } = i18nConfig;

    // entity.json에서 entity labels 추출
    const entityLabels = this.extractEntityLabels();

    // rc-keys 소스 코드 추출
    const rcKeysSourceCode = this.extractRCKeysSourceCode();

    // 플랫폼별 locale 관리 코드
    const localeManagementCode =
      target === "api"
        ? `
import { Sonamu } from "sonamu";

const DEFAULT_LOCALE = "${defaultLocale}" as const;
const SUPPORTED_LOCALES = ${JSON.stringify(supportedLocales)} as const;
function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  try {
    const ctx = Sonamu.getContext();
    return ctx.locale as (typeof SUPPORTED_LOCALES)[number] ?? DEFAULT_LOCALE;
  } catch (_) {
    return DEFAULT_LOCALE;
  }
}
`.trim()
        : `
const DEFAULT_LOCALE = "${defaultLocale}" as const;
export const SUPPORTED_LOCALES = ${JSON.stringify(supportedLocales)} as const;
let _currentLocale: (typeof SUPPORTED_LOCALES)[number] = DEFAULT_LOCALE;

export function setLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
  _currentLocale = locale;
}

export function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  return _currentLocale;
}
`.trim();

    // locale import
    const localeImports = supportedLocales
      .map((locale) => `import ${locale} from "./${locale}";`)
      .join("\n");

    // entityLabels를 코드로 변환
    const entityLabelsCode = this.generateEntityLabelsCode(entityLabels);

    // locale별 rcKeys 변수명 매핑
    const getRCKeysVarName = (locale: string) => {
      // supportedLocales에 포함된 locale만 해당 변수 반환
      if (locale === "ko" && supportedLocales.includes("ko")) return "rcKeysKo";
      if (locale === "en" && supportedLocales.includes("en")) return "rcKeysEn";
      // fallback: defaultLocale의 rcKeys
      if (locale !== defaultLocale) {
        return getRCKeysVarName(defaultLocale);
      }
      // defaultLocale조차 없는 경우 en을 fallback으로 사용
      return "rcKeysEn";
    };

    const body = `
${localeManagementCode}

${localeImports}

// react-components i18n keys
${supportedLocales.includes("ko") ? rcKeysSourceCode.ko : ""}

${supportedLocales.includes("en") ? rcKeysSourceCode.en : ""}

// entity.json에서 추출한 entity labels (defaultLocale 전용)
${entityLabelsCode}

// defaultLocale의 dictionary를 기준으로 키 추출
type RCKeys = typeof ${getRCKeysVarName(defaultLocale)};
type ProjectDictionary = typeof ${defaultLocale};
type EntityLabels = typeof entityLabels;
type RawMergedDictionary = RCKeys & Omit<EntityLabels, keyof (RCKeys & ProjectDictionary)> & ProjectDictionary;

// 키는 유지하되, 값 타입은 string 또는 함수로 일반화 (다른 locale의 리터럴 타입 충돌 방지)
export type MergedDictionary = {
  [K in keyof RawMergedDictionary]: RawMergedDictionary[K] extends (...args: infer P) => string
    ? (...args: P) => string
    : string;
};
export type DictKey = keyof MergedDictionary;
export type LocalizedString = string & { __brand: "LocalizedString" };

export function defineLocale(dict: Partial<MergedDictionary>) {
  return dict;
}

// 각 locale별로 rc-keys + entity labels + 프로젝트 dict 합침
const dictionaries: Record<string, Partial<MergedDictionary>> = {
  ${defaultLocale}: { ...${getRCKeysVarName(defaultLocale)}, ...entityLabels, ...${defaultLocale} },
  ${supportedLocales
    .filter((locale) => locale !== defaultLocale)
    .map((locale) => `  ${locale}: { ...${getRCKeysVarName(locale)}, ...${locale} },`)
    .join("\n")}
};

type SDReturnType<K extends DictKey> = MergedDictionary[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(key: K, locale: string): SDReturnType<K> {
  // 1. 지정된 locale에서 조회
  const dict = dictionaries[locale];
  if (dict?.[key] !== undefined) {
    return dict[key] as unknown as SDReturnType<K>;
  }

  // 2. default locale에서 조회
  if (locale !== DEFAULT_LOCALE && dictionaries[DEFAULT_LOCALE]?.[key] !== undefined) {
    return dictionaries[DEFAULT_LOCALE][key] as unknown as SDReturnType<K>;
  }

  // 3. supported locales 순회
  for (const supportedLocale of SUPPORTED_LOCALES) {
    if (supportedLocale !== locale && supportedLocale !== DEFAULT_LOCALE) {
      if (dictionaries[supportedLocale]?.[key] !== undefined) {
        return dictionaries[supportedLocale][key] as unknown as SDReturnType<K>;
      }
    }
  }

  // 4. 모두 실패 시 key 반환
  return key as unknown as SDReturnType<K>;
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
SD.locale = (locale: (typeof SUPPORTED_LOCALES)[number]) => <K extends DictKey>(key: K): SDReturnType<K> => {
  return getDictValue(key, locale);
};

// Localized 가능한 Column 타입 계산
type LocalizedBaseColumn<T> = {
  [K in keyof T & string]: K extends \`\${infer Base}_\${(typeof SUPPORTED_LOCALES)[number]}\` ? Base : K;
}[keyof T & string];

/**
 * locale에 따라 적절한 컬럼 값을 반환합니다.
 * DB에 name, name_ko, name_en처럼 localized column이 있을 때 사용합니다.
 *
 * 우선순위 (지원 로케일은 ko/jp/en이고, 서비스의 기본 로케일은 ko, 사용자의 로케일은 jp일 때): column_jp → column → column_ko → column_en
 * 우선순위 (지원 로케일은 ko/jp/en이고, 서비스의 기본 로케일은 en, 사용자의 로케일은 ko일 때): column_ko → column → column_en → column_jp
 *
 * @example
 * localizedColumn(tag, "name")
 */
type LocalizedColumnScalarValue = string | number | boolean | bigint;
type LocalizedColumnValue = string | string[];
type NestedLocalizedColumnValueFrom<V> = V extends string
  ? string
  : V extends readonly string[]
    ? string[]
    : never;
type LocalizedColumnValueFrom<V> = V extends string
  ? string
  : V extends readonly string[]
    ? string[]
    : V extends number | boolean | bigint
      ? string
      : V extends Partial<Record<(typeof SUPPORTED_LOCALES)[number], infer LV>>
        ? NestedLocalizedColumnValueFrom<LV>
      : never;
type LocalizedColumnCandidate<T, K extends string> =
  | (K extends keyof T ? T[K] : never)
  | {
      [L in (typeof SUPPORTED_LOCALES)[number]]: \`\${K}_\${L}\` extends keyof T ? T[\`\${K}_\${L}\`] : never;
    }[(typeof SUPPORTED_LOCALES)[number]];
type LocalizedColumnReturn<T, K extends string> =
  | LocalizedColumnValueFrom<LocalizedColumnCandidate<T, K>>
  | undefined;
type LocaleValueMap = Partial<Record<(typeof SUPPORTED_LOCALES)[number], unknown>>;

function isLocalizedColumnValue(value: unknown): value is LocalizedColumnValue {
  return typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}

function isLocalizedColumnScalarValue(value: unknown): value is LocalizedColumnScalarValue {
  return ["string", "number", "boolean", "bigint"].includes(typeof value);
}

function isEmptyLocalizedColumnValue(value: unknown): value is null | undefined | "" {
  return value === null || value === undefined || value === "";
}

function getNestedLocaleValue<T extends Record<string, unknown>, K extends LocalizedBaseColumn<T>>(
  row: T,
  column: K,
  locale: (typeof SUPPORTED_LOCALES)[number],
): unknown {
  const columnValue = row[column];
  if (columnValue === null || typeof columnValue !== "object" || Array.isArray(columnValue)) {
    return undefined;
  }

  return (columnValue as LocaleValueMap)[locale];
}

export function localizedColumn<T extends Record<string, unknown>, K extends LocalizedBaseColumn<T>>(
  row: T,
  column: K,
): LocalizedColumnReturn<T, K> {
  const currentLocale = getCurrentLocale();
  const locale = SUPPORTED_LOCALES.includes(currentLocale) ? currentLocale : DEFAULT_LOCALE;
  const otherLocales = SUPPORTED_LOCALES.filter((l: string) => l !== locale && l !== DEFAULT_LOCALE);
  const localizedKey = (column: K, locale: (typeof SUPPORTED_LOCALES)[number]) => \`\${column}_\${locale}\`;
  const values = [
    { value: row[localizedKey(column, locale)], source: "direct" },
    { value: getNestedLocaleValue(row, column, locale), source: "nested" },
    { value: row[column], source: "direct" },
    { value: row[localizedKey(column, DEFAULT_LOCALE)], source: "direct" },
    { value: getNestedLocaleValue(row, column, DEFAULT_LOCALE), source: "nested" },
    ...otherLocales.flatMap((l) => [
      { value: row[localizedKey(column, l)], source: "direct" },
      { value: getNestedLocaleValue(row, column, l), source: "nested" },
    ]),
  ];

  for (const { value, source } of values) {
    if (!isEmptyLocalizedColumnValue(value) && isLocalizedColumnValue(value)) {
      return value as LocalizedColumnReturn<T, K>;
    }
    if (source === "direct" && !isEmptyLocalizedColumnValue(value) && isLocalizedColumnScalarValue(value)) {
      return String(value) as LocalizedColumnReturn<T, K>;
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
    get(_, key: string | symbol) {
      if (typeof key === "symbol") {
        return undefined;
      }

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
      customHeaders: ["/**", " * @generated", " * 직접 수정하지 마세요.", " */", ""],
    };
  }

  /**
   * react-components의 rc-keys를 추출합
   * sonamu/src/dict/rc-keys.ts 파일의 소스 코드를 직접 읽어서 반환
   */
  private extractRCKeysSourceCode(): { ko: string; en: string } {
    try {
      // rc-keys.ts 파일 경로
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // dist에서 실행될 때는 src로 경로 변경
      const basePath = __dirname.includes("/dist/")
        ? __dirname.replace("/dist/", "/src/")
        : __dirname;

      const rcKeysPath = path.join(basePath, "../../dict/rc-keys.ts");

      // 파일 읽기
      const sourceCode = fs.readFileSync(rcKeysPath, "utf-8");

      // rcKeysKo 추출 (중괄호 카운팅 방식)
      const koCode = extractObjectDeclaration(sourceCode, "rcKeysKo");

      // rcKeysEn 추출 (중괄호 카운팅 방식)
      const enCode = extractObjectDeclaration(sourceCode, "rcKeysEn");

      return {
        ko: koCode.replace(/^export /, ""),
        en: enCode.replace(/^export /, "").replace(/ satisfies RCKeys/, " as const"),
      };
    } catch (error) {
      // rc-keys 파일이 없는 경우 빈 코드 반환
      console.warn("Failed to load rc-keys source:", error);
      return {
        ko: "const rcKeysKo = {} as const;",
        en: "const rcKeysEn = {} as const;",
      };
    }
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
}
