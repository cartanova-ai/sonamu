import fs from "fs";
import path from "path";
import { Sonamu } from "../api/sonamu";
import { type DictEntry, parseDictFile } from "./dict-parser";
import { formatCode } from "./formatter";

/**
 * 프로젝트의 i18n dict 파일 경로를 반환합니다.
 * @param locale - 로케일 (ko, en 등)
 * @param target - 타겟 디렉토리 (api, web, app)
 */
export function getProjectDictPath(locale: string, target: "api" | "web" | "app" = "api"): string {
  const dir = target === "api" ? Sonamu.config.api.dir : target;
  return path.join(Sonamu.appRootPath, dir, "src", "i18n", `${locale}.ts`);
}

/**
 * sonamu 내장 dict 파일 경로를 반환합니다.
 */
function getSonamuDictPath(locale: string): string {
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
export async function ensureDictKeys(
  requiredKeys: string[],
  target: "api" | "web" | "app" = "api",
): Promise<string[]> {
  const i18nConfig = Sonamu.config.i18n;
  if (!i18nConfig) {
    // i18n 설정이 없으면 아무것도 하지 않음
    return [];
  }

  const { defaultLocale } = i18nConfig;
  const projectDictPath = getProjectDictPath(defaultLocale, target);

  // 프로젝트 dict 파일이 없으면 아무것도 하지 않음
  if (!fs.existsSync(projectDictPath)) {
    return [];
  }

  // 프로젝트 dict에서 기존 키 파싱
  const projectEntries = parseDictFile(projectDictPath);
  const existingKeys = new Set(projectEntries.map((e) => e.key));

  // 누락된 키 찾기
  const missingKeys = requiredKeys.filter((key) => !existingKeys.has(key));

  if (missingKeys.length === 0) {
    return [];
  }

  // sonamu dict에서 기본값 가져오기
  const sonamuDictPath = getSonamuDictPath(defaultLocale);
  if (!fs.existsSync(sonamuDictPath)) {
    return [];
  }

  const sonamuEntries = parseDictFile(sonamuDictPath);
  const sonamuDict = new Map(sonamuEntries.map((e) => [e.key, e]));

  // 추가할 엔트리 생성
  const entriesToAdd = missingKeys
    .map((key) => sonamuDict.get(key))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);

  if (entriesToAdd.length === 0) {
    return [];
  }

  // 프로젝트 dict 파일에 추가
  await appendEntriesToDictFile(projectDictPath, entriesToAdd, defaultLocale, true);

  return entriesToAdd.map((e) => e.key);
}

/**
 * dict 파일에 엔트리를 추가합니다.
 * 기존 파일을 파싱하고, 새 엔트리를 추가한 뒤, 전체 파일을 재생성합니다.
 */
async function appendEntriesToDictFile(
  filePath: string,
  entries: DictEntry[],
  locale: string,
  isDefaultLocale: boolean,
): Promise<void> {
  // 기존 entries 파싱
  const existingEntries = parseDictFile(filePath);

  // 새 entries 추가
  for (const entry of entries) {
    existingEntries.push(entry);
  }

  // 파일 재생성
  const content = generateProjectDict(locale, existingEntries, isDefaultLocale);
  const formatted = formatCode(content, "typescript", filePath);
  fs.writeFileSync(filePath, formatted, "utf-8");
}

/**
 * Project dict 파일 생성
 */
export function generateProjectDict(
  locale: string,
  entries: DictEntry[],
  isDefaultLocale: boolean,
): string {
  // key 알파벳 순 정렬
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));

  const lines: string[] = [];

  if (!isDefaultLocale) {
    lines.push('import { defineLocale } from "./sd.generated";');
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
      const escapedValue = entry.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      lines.push(`  "${entry.key}": "${escapedValue}",`);
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
