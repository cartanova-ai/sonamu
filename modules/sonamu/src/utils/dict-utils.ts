import fs from "fs";
import path from "path";
import { Sonamu } from "../api/sonamu";
import { parseDictFile } from "./dict-parser";

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
  await appendEntriesToDictFile(projectDictPath, entriesToAdd);

  return entriesToAdd.map((e) => e.key);
}

/**
 * dict 파일에 엔트리를 추가합니다.
 * `} as const;` 또는 `});` 직전에 삽입합니다.
 */
async function appendEntriesToDictFile(
  filePath: string,
  entries: { key: string; value: string; isFunction: boolean }[],
): Promise<void> {
  const content = fs.readFileSync(filePath, "utf-8");

  // 새 엔트리 코드 생성
  const newLines = entries.map(({ key, value, isFunction }) => {
    const codeValue = isFunction ? value : `"${escapeString(value)}"`;
    return `  "${key}": ${codeValue},`;
  });

  // `} as const;` 또는 `});` 패턴 찾기
  // defineLocale({...}) 또는 export default {...} as const; 두 가지 패턴 지원
  const closingPatterns = [
    /(\n\s*\}\s*as\s+const\s*;?\s*)$/, // } as const;
    /(\n\s*\}\s*\)\s*;?\s*)$/, // });
  ];

  let newContent = content;
  let matched = false;

  for (const pattern of closingPatterns) {
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      const insertPosition = match.index;
      const beforeClosing = content.slice(0, insertPosition);
      const closing = match[1];

      // 마지막 쉼표 확인 및 추가
      const trimmedBefore = beforeClosing.trimEnd();
      const needsComma = !trimmedBefore.endsWith(",") && !trimmedBefore.endsWith("{");
      const comma = needsComma ? "," : "";

      newContent = `${beforeClosing}${comma}\n\n  // Sonamu 템플릿에서 자동 추가됨\n${newLines.join("\n")}${closing}`;
      matched = true;
      break;
    }
  }

  if (!matched) {
    console.warn(`[ensureDictKeys] ${filePath}에서 닫는 패턴을 찾을 수 없습니다.`);
    return;
  }

  fs.writeFileSync(filePath, newContent, "utf-8");
}

function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
