import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { Sonamu } from "../api/sonamu";
import { isStringValue } from "../utils/runtime-value";
import {
  type CddAcEntry,
  type CddAcFile,
  type CddAcListResult,
  type CddAddRuleRequest,
  type CddContentResult,
  type CddFileType,
  type CddRuleDetail,
  type CddRuleEntry,
  type CddRuleSummary,
  type CddTreeNode,
} from "./cdd-types";

interface CddTreeResult {
  exists: boolean;
  tree: CddTreeNode[];
}
interface EditorCliConfig {
  cli: string;
  waitFlag: string;
}
interface EditorCliResolution {
  bin: string;
  args: string[];
}
interface CddRulesResult {
  rules: CddRuleSummary[];
}

export type {
  CddAcEntry,
  CddAcFile,
  CddAcListResult,
  CddAddRuleRequest,
  CddContentResult,
  CddFileType,
  CddRuleDetail,
  CddRuleEntry,
  CddRuleSummary,
  CddTreeNode,
} from "./cdd-types";

/** contract/ 디렉터리 절대 경로 반환 (apiRootPath 기준) */
function getContractDir(): string {
  return path.join(Sonamu.apiRootPath, "..", "..", "contract");
}

/** 프로젝트 루트 경로 반환 */
function getProjectRoot(): string {
  return path.join(Sonamu.apiRootPath, "..", "..");
}

/** 경로가 contract/ 디렉터리 내부인지 검증 */
function assertInsideContractDir(filePath: string): void {
  const contractDir = getContractDir();
  const resolved = path.resolve(contractDir, filePath);
  if (!resolved.startsWith(contractDir + path.sep) && resolved !== contractDir) {
    throw new Error(`경로가 contract/ 디렉터리 밖을 참조합니다: ${filePath}`);
  }
}

/** 파일명에서 CddFileType 판별 */
function detectFileType(fileName: string): CddFileType | undefined {
  if (fileName.endsWith(".contract.md")) return "contract";
  if (fileName.endsWith(".rules.json")) return "rules";
  return undefined;
}

/** 디렉터리를 재귀 탐색하여 CddTreeNode 트리를 생성 */
function scanDirectory(dirPath: string, relativeTo: string): CddTreeNode[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const nodes: CddTreeNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(relativeTo, fullPath);

    if (entry.isDirectory()) {
      if (entry.name === "rules") continue;
      const children = scanDirectory(fullPath, relativeTo);
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "directory",
          children,
        });
      }
    } else if (entry.isFile()) {
      const fileType = detectFileType(entry.name);
      if (fileType && fileType !== "rules") {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "file",
          fileType,
        });
      }
    }
  }

  return nodes;
}

/** contract/ 디렉터리의 트리 구조를 반환 */
export function getCddTree(): CddTreeResult {
  const contractDir = getContractDir();
  if (!fs.existsSync(contractDir)) {
    return { exists: false, tree: [] };
  }
  const tree = scanDirectory(contractDir, contractDir);
  return { exists: true, tree };
}

/** 파일 내용을 읽어 반환 (contract.md → markdown 원문, rules.json → JSON 문자열) */
export function readContent(filePath: string): CddContentResult {
  assertInsideContractDir(filePath);

  const contractDir = getContractDir();
  const absPath = path.resolve(contractDir, filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  const content = fs.readFileSync(absPath, "utf-8");
  const fileType = detectFileType(path.basename(filePath));

  return {
    content,
    fileType: fileType ?? "contract",
  };
}

/** 파일을 외부 에디터로 직접 편집 */
export async function editContent(
  filePath: string,
): Promise<{ success: boolean; filePath: string }> {
  assertInsideContractDir(filePath);

  const contractDir = getContractDir();
  const absPath = path.resolve(contractDir, filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  const editor = resolveEditorCli();
  await runEditor(editor, absPath);

  return { success: true, filePath };
}

/** 에디터별 앱 번들 내 CLI 경로 + --wait 플래그 매핑 */
const EDITOR_CLI_MAP = {
  "Visual Studio Code": { cli: "Contents/Resources/app/bin/code", waitFlag: "--wait" },
  Zed: { cli: "Contents/MacOS/cli", waitFlag: "--wait" },
  Cursor: { cli: "Contents/Resources/app/bin/cursor", waitFlag: "--wait" },
} satisfies Record<string, EditorCliConfig>;

/** 앱 번들 CLI 경로를 resolve. wait=false이면 --wait 플래그를 생략 */
function resolveEditorCli(options?: { wait?: boolean }): EditorCliResolution {
  const wait = options?.wait ?? true;
  const appName = Sonamu.config.externalEditor ?? "Visual Studio Code";
  const mapping = Object.entries(EDITOR_CLI_MAP).find(([name]) => name === appName)?.[1];
  if (!mapping) {
    throw new Error(
      `지원되지 않는 에디터입니다: ${appName} (지원: ${Object.keys(EDITOR_CLI_MAP).join(", ")})`,
    );
  }

  const searchPaths = [
    `/Applications/${appName}.app`,
    `${os.homedir()}/Applications/${appName}.app`,
  ];
  const bundlePath = searchPaths.find((p) => fs.existsSync(p));
  if (!bundlePath) {
    throw new Error(`앱 번들을 찾을 수 없습니다: ${appName} (/Applications 확인)`);
  }

  const cliBin = path.join(bundlePath, mapping.cli);
  if (!fs.existsSync(cliBin)) {
    throw new Error(`에디터 CLI를 찾을 수 없습니다: ${cliBin}`);
  }

  return { bin: cliBin, args: wait ? [mapping.waitFlag] : [] };
}

/** 에디터 CLI를 실행하고 탭이 닫힐 때까지 대기 */
function runEditor(editor: { bin: string; args: string[] }, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editor.bin, [...editor.args, filePath], {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      reject(new Error(`에디터 실행 실패 (${editor.bin}): ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`에디터가 비정상 종료되었습니다 (exit code: ${code})`));
      }
    });
  });
}

/** 소스 파일을 외부 에디터로 열기 (대기하지 않음) */
export function openSourceFile(filePath: string): void {
  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(Sonamu.apiRootPath, filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  const editor = resolveEditorCli({ wait: false });
  const child = spawn(editor.bin, [...editor.args, absPath], {
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

/* ========================================================================
 * Rules API
 * ======================================================================== */

/** contract/rules/ 디렉터리 내 .rules.json 파일 목록 반환 */
export function listRules(): CddRulesResult {
  const contractDir = getContractDir();
  const rulesDir = path.join(contractDir, "rules");
  if (!fs.existsSync(rulesDir)) return { rules: [] };

  const entries = fs.readdirSync(rulesDir, { withFileTypes: true });
  const rules: CddRuleSummary[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".rules.json")) continue;

    const key = entry.name.replace(/\.rules\.json$/, "");
    const relPath = `rules/${entry.name}`;
    const absPath = path.join(rulesDir, entry.name);

    try {
      const raw = fs.readFileSync(absPath, "utf-8");
      const doc = /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ JSON.parse(
        raw,
      ) as { description?: string; rules?: unknown[] };
      rules.push({
        key,
        path: relPath,
        description: isStringValue(doc.description) ? doc.description : "",
        ruleCount: Array.isArray(doc.rules) ? doc.rules.length : 0,
      });
    } catch (err) {
      rules.push({
        key,
        path: relPath,
        description: "",
        ruleCount: 0,
        parseError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { rules };
}

/** rules 파일 상세 반환 */
export function readRule(ruleKey: string): CddRuleDetail {
  const contractDir = getContractDir();
  const absPath = path.join(contractDir, "rules", `${ruleKey}.rules.json`);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Rules 파일을 찾을 수 없습니다: ${ruleKey}`);
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  const doc = /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ JSON.parse(
    raw,
  ) as { description?: string; rules?: CddRuleEntry[] };

  return {
    key: ruleKey,
    path: `rules/${ruleKey}.rules.json`,
    description: isStringValue(doc.description) ? doc.description : "",
    rules: Array.isArray(doc.rules) ? doc.rules : [],
  };
}

/** rules 파일에 규칙 추가 */
export function addRule(req: CddAddRuleRequest): CddRuleDetail {
  const contractDir = getContractDir();
  const rulesDir = path.join(contractDir, "rules");
  const absPath = path.join(rulesDir, `${req.ruleKey}.rules.json`);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Rules 파일을 찾을 수 없습니다: ${req.ruleKey}`);
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  const doc = /* SAFETY: UI 도구의 Zod 입력 스키마가 이 값의 타입을 보장한다. */ JSON.parse(
    raw,
  ) as { description?: string; rules?: CddRuleEntry[] };
  const rules: CddRuleEntry[] = Array.isArray(doc.rules) ? doc.rules : [];

  const nextId = generateNextRuleId(rules);
  const newEntry: CddRuleEntry = {
    id: nextId,
    when: req.when,
    instruction: req.instruction,
  };
  if (req.examples && req.examples.length > 0) {
    newEntry.examples = req.examples;
  }

  rules.push(newEntry);
  doc.rules = rules;

  fs.writeFileSync(absPath, `${JSON.stringify(doc, null, 2)}\n`, "utf-8");

  return {
    key: req.ruleKey,
    path: `rules/${req.ruleKey}.rules.json`,
    description: isStringValue(doc.description) ? doc.description : "",
    rules,
  };
}

/** 기존 id 패턴을 분석하여 다음 순번 id 생성 */
function generateNextRuleId(rules: CddRuleEntry[]): string {
  if (rules.length === 0) return "R-001";

  const numericPattern = /^(.+?)(\d+)$/;
  let bestPrefix = "R-";
  let maxNum = 0;

  for (const rule of rules) {
    const match = numericPattern.exec(rule.id);
    if (match) {
      const prefix = match[1];
      const num = Number.parseInt(match[2], 10);
      if (num > maxNum) {
        bestPrefix = prefix;
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  const padLen = Math.max(3, String(maxNum).length);
  return `${bestPrefix}${String(nextNum).padStart(padLen, "0")}`;
}

/* ========================================================================
 * AC API (modules/cdd ac-list 파싱 로직 복사)
 * ======================================================================== */

/** describe/test 패턴 파싱 */
function parseAcEntries(content: string): CddAcEntry[] {
  const entries: CddAcEntry[] = [];
  const lines = content.split("\n");

  let currentDescribe: string | null = null;
  let describeDepth = 0;
  let braceDepth = 0;
  let pendingTestAs = false;
  let testAsBraceDepth = 0;
  let testAsNeedName = false;

  for (const line of lines) {
    const trimmed = line.trim();

    const describeMatch = trimmed.match(/^describe\(["'`](.+?)["'`]/);
    if (describeMatch) {
      currentDescribe = describeMatch[1];
      describeDepth = braceDepth;
    }

    const testMatch = trimmed.match(/^(?:test|it)\(["'`](.+?)["'`]/);
    if (testMatch) {
      entries.push({
        describe: currentDescribe,
        test: testMatch[1],
      });
    }

    if (!pendingTestAs && trimmed.match(/^testAs\s*\(/)) {
      const inlineMatch = trimmed.match(/^testAs\s*\(\s*\{[^}]*\}\s*,\s*["'`](.+?)["'`]/);
      if (inlineMatch) {
        entries.push({ describe: currentDescribe, test: inlineMatch[1] });
      } else {
        pendingTestAs = true;
        testAsBraceDepth = 0;
        testAsNeedName = false;
        for (const ch of trimmed) {
          if (ch === "{") testAsBraceDepth++;
          if (ch === "}") testAsBraceDepth--;
        }
        if (testAsBraceDepth <= 0) {
          testAsNeedName = true;
          const nameMatch = trimmed.match(/}\s*,\s*["'`](.+?)["'`]/);
          if (nameMatch) {
            entries.push({ describe: currentDescribe, test: nameMatch[1] });
            pendingTestAs = false;
            testAsNeedName = false;
          }
        }
      }
    } else if (pendingTestAs) {
      if (!testAsNeedName) {
        for (const ch of trimmed) {
          if (ch === "{") testAsBraceDepth++;
          if (ch === "}") testAsBraceDepth--;
        }
        if (testAsBraceDepth <= 0) {
          testAsNeedName = true;
          const nameMatch = trimmed.match(/}\s*,\s*["'`](.+?)["'`]/);
          if (nameMatch) {
            entries.push({ describe: currentDescribe, test: nameMatch[1] });
            pendingTestAs = false;
            testAsNeedName = false;
          }
        }
      } else {
        const nameMatch = trimmed.match(/^["'`](.+?)["'`]/);
        if (nameMatch) {
          entries.push({ describe: currentDescribe, test: nameMatch[1] });
          pendingTestAs = false;
          testAsNeedName = false;
        }
      }
    }

    for (const ch of trimmed) {
      if (ch === "{") braceDepth++;
      if (ch === "}") {
        braceDepth--;
        if (currentDescribe && braceDepth <= describeDepth) {
          currentDescribe = null;
        }
      }
    }
  }

  return entries;
}

/** 프로젝트 내 *.test.ts 파일을 스캔하여 AC 목록 반환 */
export function getAcList(): CddAcListResult {
  const projectRoot = getProjectRoot();
  const files = findTestFiles(projectRoot);

  const acFiles: CddAcFile[] = [];
  for (const absPath of files) {
    const content = fs.readFileSync(absPath, "utf-8");
    const entries = parseAcEntries(content);
    if (entries.length > 0) {
      acFiles.push({
        path: path.relative(projectRoot, absPath),
        entries,
      });
    }
  }

  const total = acFiles.reduce((sum, f) => sum + f.entries.length, 0);
  return { files: acFiles, total };
}

/** *.test.ts 파일을 재귀 탐색 (node_modules, dist 제외) */
function findTestFiles(dir: string): string[] {
  const results: string[] = [];
  const IGNORE = new Set(["node_modules", "dist", ".git", "contract"]);

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORE.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  results.sort();
  return results;
}
