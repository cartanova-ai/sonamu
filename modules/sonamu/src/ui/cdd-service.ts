import { spawn } from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Sonamu } from "../api/sonamu";

export type CddFileType = "contract" | "spec";

export type CddTreeNode = {
  name: string;
  /** contract/ 기준 상대 경로 */
  path: string;
  type: "file" | "directory";
  /** file인 경우만 존재 */
  fileType?: CddFileType;
  /** directory인 경우만 존재 */
  children?: CddTreeNode[];
};

/** contract/ 디렉터리 절대 경로 반환 (프로젝트 루트 기준) */
function getContractDir(): string {
  return path.join(path.dirname(Sonamu.apiRootPath), "contract");
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
  if (fileName.endsWith(".contract.json")) return "contract";
  if (fileName.endsWith(".spec.json")) return "spec";
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
      const children = scanDirectory(fullPath, relativeTo);
      nodes.push({
        name: entry.name,
        path: relPath,
        type: "directory",
        children,
      });
    } else if (entry.isFile()) {
      const fileType = detectFileType(entry.name);
      if (fileType) {
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
export function getCddTree(): { exists: boolean; tree: CddTreeNode[] } {
  const contractDir = getContractDir();
  if (!fs.existsSync(contractDir)) {
    return { exists: false, tree: [] };
  }
  const tree = scanDirectory(contractDir, contractDir);
  return { exists: true, tree };
}

/** JSON 파일의 전체 내용을 읽어 반환 */
export function readContent(filePath: string): Record<string, unknown> {
  assertInsideContractDir(filePath);

  const contractDir = getContractDir();
  const absPath = path.resolve(contractDir, filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  const raw = fs.readFileSync(absPath, "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}

/** JSON 파일의 content 필드를 외부 에디터로 편집 */
export async function editContent(
  filePath: string,
): Promise<{ success: boolean; filePath: string }> {
  assertInsideContractDir(filePath);

  const contractDir = getContractDir();
  const absPath = path.resolve(contractDir, filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`파일을 찾을 수 없습니다: ${filePath}`);
  }

  const editorCli = resolveEditorCli();

  const raw = fs.readFileSync(absPath, "utf-8");
  const json: Record<string, unknown> = JSON.parse(raw);

  const content = typeof json.content === "string" ? json.content : "";

  const tmpFileName = `cdd-edit-${crypto.randomUUID()}.md`;
  const tmpFilePath = path.join(os.tmpdir(), tmpFileName);

  fs.writeFileSync(tmpFilePath, content, "utf-8");

  try {
    await runEditor(editorCli, tmpFilePath);

    const edited = fs.readFileSync(tmpFilePath, "utf-8");
    json.content = edited;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    json.lastModified = `${yyyy}-${mm}-${dd}`;

    fs.writeFileSync(absPath, `${JSON.stringify(json, null, 2)}\n`, "utf-8");

    return { success: true, filePath };
  } finally {
    if (fs.existsSync(tmpFilePath)) {
      fs.unlinkSync(tmpFilePath);
    }
  }
}

/** 알려진 에디터의 앱 번들 내 CLI 경로 + wait 플래그 매핑 */
const EDITOR_CLI_MAP: Record<string, { cli: string; waitFlag: string }> = {
  zed: { cli: "Contents/MacOS/cli", waitFlag: "--wait" },
  "zed preview": { cli: "Contents/MacOS/cli", waitFlag: "--wait" },
  "visual studio code": { cli: "Contents/Resources/app/bin/code", waitFlag: "--wait" },
  "sublime text": { cli: "Contents/SharedSupport/bin/subl", waitFlag: "--wait" },
};

/** 앱 이름으로 /Applications 에서 .app 번들 경로를 탐색 */
function findAppBundle(appName: string): string | undefined {
  const candidates = [
    `/Applications/${appName}.app`,
    `${os.homedir()}/Applications/${appName}.app`,
  ];
  return candidates.find((p) => fs.existsSync(p));
}

/** externalEditor 설정에서 CLI 실행 정보를 resolve */
function resolveEditorCli(): { bin: string; args: string[] } {
  const app = Sonamu.config.externalEditor;
  if (!app) {
    throw new Error(
      "에디터를 찾을 수 없습니다. sonamu.config.ts의 externalEditor를 설정해주세요. (예: 'Zed')",
    );
  }

  const bundlePath = findAppBundle(app);
  if (!bundlePath) {
    throw new Error(`앱 번들을 찾을 수 없습니다: ${app} (/Applications 확인)`);
  }

  const mapping = EDITOR_CLI_MAP[app.toLowerCase()];
  if (!mapping) {
    throw new Error(
      `지원되지 않는 에디터입니다: ${app} (지원: ${Object.keys(EDITOR_CLI_MAP).join(", ")})`,
    );
  }

  const cliBin = path.join(bundlePath, mapping.cli);
  if (!fs.existsSync(cliBin)) {
    throw new Error(`에디터 CLI를 찾을 수 없습니다: ${cliBin}`);
  }

  return { bin: cliBin, args: [mapping.waitFlag] };
}

/** 에디터 CLI를 실행하고 탭이 닫힐 때까지 대기 */
function runEditor(editorCli: { bin: string; args: string[] }, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(editorCli.bin, [...editorCli.args, filePath], {
      stdio: "inherit",
    });

    child.on("error", (err) => {
      reject(new Error(`에디터 실행 실패 (${editorCli.bin}): ${err.message}`));
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
