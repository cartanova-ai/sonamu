import { execFile } from "node:child_process";

// --- 타입 정의 ---

export interface GitNumstatEntry {
  path: string;
  added: number | null;
  removed: number | null;
}

export interface GitHistoryCommit {
  hash: string;
  author: { name: string; email: string };
  authoredAt: string;
  subject: string;
  body: string;
  files: GitNumstatEntry[];
  totalAdded: number;
  totalRemoved: number;
}

export interface GitBlameLine {
  lineNumber: number;
  commitHash: string;
  author: { name: string; email: string };
  content: string;
}

export interface GitBlameReport {
  revision: string;
  path: string;
  totalLines: number;
  lines: GitBlameLine[];
}

export interface GitDiffResult {
  path: string;
  baseRef: string;
  headRef: string;
  diffText: string;
}

// --- 내부 실행기 ---

const RS = "\x1e"; // Record Separator
const US = "\x1f"; // Unit Separator

interface RunGitOptions {
  cwd: string;
  timeoutMs?: number;
}

function runGit(
  args: string[],
  options: RunGitOptions,
): Promise<{ stdout: string; stderr: string }> {
  const timeout = options.timeoutMs ?? 30_000;
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      { cwd: options.cwd, maxBuffer: 50 * 1024 * 1024, timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
    // execFile의 timeout 옵션이 SIGTERM을 보내므로 별도 처리 불필요
    void child;
  });
}

// --- 공개 함수 ---

interface ListFileHistoryOptions {
  cwd: string;
  since?: string;
  until?: string;
  timeoutMs?: number;
}

export async function listFileHistory(
  specAbsPath: string,
  options: ListFileHistoryOptions,
): Promise<GitHistoryCommit[]> {
  const formatParts = ["%H", "%an", "%ae", "%aI", "%s", "%b"].join(US);
  const format = `${RS}${formatParts}`;

  const args = ["log", `--format=${format}`, "--numstat", "--"];
  if (options.since) args.splice(1, 0, `--since=${options.since}`);
  if (options.until) args.splice(1, 0, `--until=${options.until}`);
  args.push(specAbsPath);

  const { stdout } = await runGit(args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });

  return parseLogOutput(stdout);
}

/** git log --numstat 출력을 파싱합니다 */
export function parseLogOutput(stdout: string): GitHistoryCommit[] {
  const records = stdout.split(RS).filter((r) => r.trim().length > 0);
  const commits: GitHistoryCommit[] = [];

  for (const record of records) {
    const lines = record.split("\n");
    // 첫 줄: US 구분 헤더
    const headerLine = lines[0];
    const headerParts = headerLine.split(US);
    if (headerParts.length < 6) continue;

    const [hash, authorName, authorEmail, authoredAt, subject, ...bodyParts] = headerParts;
    const body = bodyParts.join(US).trim();

    const files: GitNumstatEntry[] = [];
    // 나머지 줄: numstat 행
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      const parts = line.split("\t");
      if (parts.length < 3) continue;

      const [addedStr, removedStr, filePath] = parts;
      files.push({
        path: filePath,
        added: addedStr === "-" ? null : Number(addedStr),
        removed: removedStr === "-" ? null : Number(removedStr),
      });
    }

    let totalAdded = 0;
    let totalRemoved = 0;
    for (const f of files) {
      if (f.added !== null) totalAdded += f.added;
      if (f.removed !== null) totalRemoved += f.removed;
    }

    commits.push({
      hash,
      author: { name: authorName, email: authorEmail },
      authoredAt,
      subject,
      body,
      files,
      totalAdded,
      totalRemoved,
    });
  }

  return commits;
}

interface BlameFileOptions {
  cwd: string;
  revision?: string;
  timeoutMs?: number;
}

export async function blameFile(
  specAbsPath: string,
  options: BlameFileOptions,
): Promise<GitBlameReport> {
  const revision = options.revision ?? "HEAD";
  const args = ["blame", "--porcelain", revision, "--", specAbsPath];

  const { stdout } = await runGit(args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });

  return parseBlameOutput(stdout, revision, specAbsPath);
}

/** git blame --porcelain 출력을 파싱합니다 */
export function parseBlameOutput(
  stdout: string,
  revision: string,
  filePath: string,
): GitBlameReport {
  const lines = stdout.split("\n");
  const blameLines: GitBlameLine[] = [];

  let currentHash = "";
  const authorMap = new Map<string, { name: string; email: string }>();

  for (const line of lines) {
    if (line === "") continue;

    // 커밋 헤더 행: <hash> <orig-line> <final-line> [<group-count>]
    const headerMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)(?:\s+\d+)?$/);
    if (headerMatch) {
      currentHash = headerMatch[1];
      continue;
    }

    if (line.startsWith("author ")) {
      const authorName = line.slice(7);
      const existing = authorMap.get(currentHash);
      if (existing) {
        existing.name = authorName;
      } else {
        authorMap.set(currentHash, { name: authorName, email: "" });
      }
      continue;
    }

    if (line.startsWith("author-mail ")) {
      // "<email>" 형식에서 꺾쇠 제거
      const email = line.slice(12).replace(/^<|>$/g, "");
      const existing = authorMap.get(currentHash);
      if (existing) {
        existing.email = email;
      }
      continue;
    }

    // 실제 컨텐츠 행: 탭으로 시작
    if (line.startsWith("\t")) {
      const content = line.slice(1);
      const author = authorMap.get(currentHash) ?? {
        name: "",
        email: "",
      };
      blameLines.push({
        lineNumber: blameLines.length + 1,
        commitHash: currentHash,
        author: { name: author.name, email: author.email },
        content,
      });
    }
  }

  return {
    revision,
    path: filePath,
    totalLines: blameLines.length,
    lines: blameLines,
  };
}

interface GetFileDiffOptions {
  cwd: string;
  baseRef?: string;
  headRef?: string;
  commit?: string;
  timeoutMs?: number;
}

export async function getFileDiff(
  specAbsPath: string,
  options: GetFileDiffOptions,
): Promise<GitDiffResult> {
  let args: string[];
  let baseRef: string;
  let headRef: string;

  if (options.commit) {
    // 특정 커밋의 diff: 루트 커밋이면 ~1 참조가 없으므로 --root fallback을 사용합니다.
    baseRef = `${options.commit}~1`;
    headRef = options.commit;
    args = ["diff", baseRef, headRef, "--", specAbsPath];

    try {
      const { stdout } = await runGit(args, {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
      });
      return { path: specAbsPath, baseRef, headRef, diffText: stdout };
    } catch {
      // 루트 커밋은 ~1이 없으므로 --root 옵션으로 재시도합니다.
      const rootArgs = ["diff", "--root", headRef, "--", specAbsPath];
      const { stdout } = await runGit(rootArgs, {
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
      });
      return { path: specAbsPath, baseRef: "", headRef, diffText: stdout };
    }
  }

  baseRef = options.baseRef ?? "HEAD~1";
  headRef = options.headRef ?? "HEAD";
  args = ["diff", `${baseRef}..${headRef}`, "--", specAbsPath];

  const { stdout } = await runGit(args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });

  return {
    path: specAbsPath,
    baseRef,
    headRef,
    diffText: stdout,
  };
}
