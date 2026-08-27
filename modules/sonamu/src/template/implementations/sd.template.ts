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
    const locale = ctx.locale;
    return SUPPORTED_LOCALES.find((supportedLocale) => supportedLocale === locale) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
`.trim()
        : `
const DEFAULT_LOCALE = "${defaultLocale}" as const;
export const SUPPORTED_LOCALES = ${JSON.stringify(supportedLocales)} as const;
let currentLocale: (typeof SUPPORTED_LOCALES)[number] = DEFAULT_LOCALE;

export function setLocale(locale: (typeof SUPPORTED_LOCALES)[number]) {
  currentLocale = locale;
}

export function getCurrentLocale(): (typeof SUPPORTED_LOCALES)[number] {
  return currentLocale;
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
type DictionaryRegistry = {
  [L in (typeof SUPPORTED_LOCALES)[number]]: Partial<MergedDictionary>;
};
const dictionaries: DictionaryRegistry = {
  ${defaultLocale}: { ...${getRCKeysVarName(defaultLocale)}, ...entityLabels, ...${defaultLocale} },
  ${supportedLocales
    .filter((locale) => locale !== defaultLocale)
    .map((locale) => `  ${locale}: { ...${getRCKeysVarName(locale)}, ...${locale} },`)
    .join("\n")}
};

type SDReturnType<K extends DictKey> = MergedDictionary[K] extends (...args: infer P) => string
  ? (...args: P) => LocalizedString
  : LocalizedString;

function getDictValue<K extends DictKey>(key: K, locale: (typeof SUPPORTED_LOCALES)[number]): SDReturnType<K> {
  // 1. 지정된 locale에서 조회
  const dict = dictionaries[locale];
  if (dict?.[key] !== undefined) {
    // SAFETY: 요청 locale의 같은 키는 MergedDictionary가 정한 반환 종류를 유지합니다.
    return dict[key] as SDReturnType<K>;
  }

  // 2. default locale에서 조회
  if (locale !== DEFAULT_LOCALE && dictionaries[DEFAULT_LOCALE]?.[key] !== undefined) {
    // SAFETY: 기본 locale의 같은 키는 MergedDictionary가 정한 반환 종류를 유지합니다.
    return dictionaries[DEFAULT_LOCALE][key] as SDReturnType<K>;
  }

  // 3. supported locales 순회
  for (const supportedLocale of SUPPORTED_LOCALES) {
    if (supportedLocale !== locale && supportedLocale !== DEFAULT_LOCALE) {
      if (dictionaries[supportedLocale]?.[key] !== undefined) {
        // SAFETY: 대체 locale의 같은 키는 MergedDictionary가 정한 반환 종류를 유지합니다.
        return dictionaries[supportedLocale][key] as SDReturnType<K>;
      }
    }
  }

  // 모든 locale에 값이 없으면 동적으로 조합된 키를 그대로 노출합니다.
  // SAFETY: 누락된 사전 키의 문자열 표현은 LocalizedString fallback 규약을 따릅니다.
  return String(key) as SDReturnType<K>;
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
type LocaleValueMap = {
  [L in (typeof SUPPORTED_LOCALES)[number]]?: LocalizedColumnValue;
};
function isString<V>(value: V): value is V & string {
  return Object.prototype.toString.call(value) === "[object String]";
}

function isLocalizedColumnValue<V>(value: V): value is V & LocalizedColumnValue {
  return isString(value) || (Array.isArray(value) && value.every(isString));
}

function isLocalizedColumnScalarValue<V>(value: V): value is V & LocalizedColumnScalarValue {
  return ["[object String]", "[object Number]", "[object Boolean]", "[object BigInt]"].includes(
    Object.prototype.toString.call(value),
  );
}

function isEmptyLocalizedColumnValue<V>(value: V): value is V & (null | undefined | "") {
  return value === null || value === undefined || value === "";
}

type PropertyValue<T, K extends PropertyKey> = K extends keyof T ? T[K] : undefined;

function getProperty<T extends object, K extends PropertyKey>(row: T, key: K): PropertyValue<T, K> {
  if (!(key in row)) {
    // SAFETY: 존재하지 않는 후보 키는 조건부 속성 타입에서도 undefined입니다.
    return undefined as PropertyValue<T, K>;
  }

  // SAFETY: own/inherited 키 존재를 확인했으므로 해당 키의 조건부 속성 타입으로 좁힐 수 있습니다.
  return (row as T & Record<K, PropertyValue<T, K>>)[key];
}

function getNestedLocaleValue<T extends object, K extends LocalizedBaseColumn<T>>(
  row: T,
  column: K,
  locale: (typeof SUPPORTED_LOCALES)[number],
): LocalizedColumnValue | undefined {
  const columnValue = getProperty(row, column);
  if (columnValue === null || Object.prototype.toString.call(columnValue) !== "[object Object]") {
    return undefined;
  }

  // SAFETY: 일반 객체 검사를 통과한 값만 locale별 값 맵으로 조회합니다.
  return (columnValue as LocaleValueMap)[locale];
}

function localizedKey<K extends string>(columnName: K, localeName: (typeof SUPPORTED_LOCALES)[number]) {
  return \`\${columnName}_\${localeName}\`;
}

export function localizedColumn<T extends object, K extends LocalizedBaseColumn<T>>(
  row: T,
  column: K,
): LocalizedColumnReturn<T, K> {
  const requestedLocale = getCurrentLocale();
  const locale = SUPPORTED_LOCALES.includes(requestedLocale) ? requestedLocale : DEFAULT_LOCALE;
  const otherLocales = SUPPORTED_LOCALES.filter(
    (candidateLocale) => candidateLocale !== locale && candidateLocale !== DEFAULT_LOCALE,
  );
  const values = [
    { value: getProperty(row, localizedKey(column, locale)), source: "direct" },
    { value: getNestedLocaleValue(row, column, locale), source: "nested" },
    { value: getProperty(row, column), source: "direct" },
    { value: getProperty(row, localizedKey(column, DEFAULT_LOCALE)), source: "direct" },
    { value: getNestedLocaleValue(row, column, DEFAULT_LOCALE), source: "nested" },
    ...otherLocales.flatMap((l) => [
      { value: getProperty(row, localizedKey(column, l)), source: "direct" },
      { value: getNestedLocaleValue(row, column, l), source: "nested" },
    ]),
  ];

  for (const { value, source } of values) {
    if (!isEmptyLocalizedColumnValue(value) && isLocalizedColumnValue(value)) {
      // SAFETY: 값 가드가 선택한 컬럼의 문자열 또는 문자열 배열임을 확인했습니다.
      return value as LocalizedColumnReturn<T, K>;
    }
    if (source === "direct" && !isEmptyLocalizedColumnValue(value) && isLocalizedColumnScalarValue(value)) {
      // SAFETY: 직접 컬럼의 스칼라 값은 문자열로 변환해 지역화 반환 타입을 충족합니다.
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
interface EnumLabels {
  [key: string]: LocalizedString;
}

SD.enumLabels = (enumName: string): EnumLabels => {
  return new Proxy<EnumLabels>({}, {
    get(_, key: string | symbol) {
      if (Object.prototype.toString.call(key) === "[object Symbol]") {
        return undefined;
      }

      // SAFETY: 생성된 enum 이름과 값의 조합은 enum 사전 키 형식을 따릅니다.
      const dictKey = \`enum.\${enumName}.\${String(key)}\` as DictKey;
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
  private extractRCKeysSourceCode() {
    try {
      // rc-keys.ts 파일 경로
      const currentFilename = fileURLToPath(import.meta.url);
      const currentDirectory = path.dirname(currentFilename);

      // dist에서 실행될 때는 src로 경로 변경
      const basePath = currentDirectory.includes("/dist/")
        ? currentDirectory.replace("/dist/", "/src/")
        : currentDirectory;

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
