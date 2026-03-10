import chalk from "chalk";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import type { GitDiffResult, GitHistoryCommit } from "../utils/git.js";
import { getFileDiff, listFileHistory } from "../utils/git.js";

// --- 타입 정의 ---

export interface ExplainOptions {
  cwd: string;
  since?: string;
  until?: string;
  commit?: string;
}

export interface ExplainDeps {
  listFileHistory: typeof listFileHistory;
  getFileDiff: typeof getFileDiff;
  callAi: typeof callAi;
}

export interface ExplainChange {
  section: string;
  author: string;
  date: string;
  what: string;
  why: string;
  impact: "low" | "medium" | "high";
}

export interface ExplainResult {
  changes: ExplainChange[];
  overall_summary: string;
  breaking_changes: string[];
}

export const defaultExplainDeps: ExplainDeps = {
  listFileHistory,
  getFileDiff,
  callAi,
};

// --- 공개 함수 ---

/**
 * 파일에 대한 explain 분석을 수행합니다. 결과가 없으면 null을 반환합니다.
 */
export async function runExplain(
  absPath: string,
  displayPath: string,
  options: ExplainOptions,
  deps: ExplainDeps,
): Promise<ExplainResult | null> {
  const context = options.commit
    ? await buildCommitContext(absPath, options, deps)
    : await buildRangeContext(absPath, options, deps);

  if (!context.diff.diffText && context.commits.length === 0) {
    return null;
  }

  const prompt = buildPrompt(displayPath, context.commits, context.diff);

  const fallback: ExplainResult = {
    changes: [],
    overall_summary: "",
    breaking_changes: [],
  };

  const aiResult: AiCallResult<ExplainResult> = await deps.callAi({
    cwd: options.cwd,
    prompt,
    fallback,
    parse: parseExplainResult,
  });

  return aiResult.value;
}

export function printExplainPretty(
  label: string,
  displayPath: string,
  result: ExplainResult,
): void {
  console.log(chalk.bold(`${label}: ${displayPath}`));
  if (result.overall_summary) {
    console.log(chalk.dim(result.overall_summary));
  }
  console.log();

  if (result.changes.length === 0) {
    console.log(chalk.dim("  변경 사항이 없습니다."));
  } else {
    for (const change of result.changes) {
      const colorFn = impactColors[change.impact];
      console.log(
        `  ${chalk.bold(change.section)} ${chalk.dim(`(${change.date}, ${change.author})`)}`,
      );
      console.log(`    what: ${change.what}`);
      console.log(`    why:  ${change.why}`);
      console.log(`    impact: ${colorFn(change.impact)}`);
      console.log();
    }
  }

  if (result.breaking_changes.length > 0) {
    console.log(chalk.red.bold("Breaking Changes:"));
    for (const bc of result.breaking_changes) {
      console.log(chalk.red(`  - ${bc}`));
    }
    console.log();
  }
}

export function printExplainEmpty(label: string, displayPath: string): void {
  console.log(chalk.bold(`${label}: ${displayPath}`));
  console.log(chalk.dim("변경 이력이 없습니다."));
}

// --- 내부 함수 ---

interface ExplainContext {
  commits: GitHistoryCommit[];
  diff: GitDiffResult;
}

async function buildCommitContext(
  absPath: string,
  options: ExplainOptions,
  deps: ExplainDeps,
): Promise<ExplainContext> {
  const commits = await deps.listFileHistory(absPath, {
    cwd: options.cwd,
  });

  const targetCommit = commits.find((c) => c.hash === options.commit);
  const filteredCommits = targetCommit ? [targetCommit] : [];

  const diff = await deps.getFileDiff(absPath, {
    cwd: options.cwd,
    commit: options.commit,
  });

  return { commits: filteredCommits, diff };
}

async function buildRangeContext(
  absPath: string,
  options: ExplainOptions,
  deps: ExplainDeps,
): Promise<ExplainContext> {
  const commits = await deps.listFileHistory(absPath, {
    cwd: options.cwd,
    since: options.since,
    until: options.until,
  });

  const oldestHash = commits.length > 0 ? commits[commits.length - 1].hash : undefined;
  const newestHash = commits.length > 0 ? commits[0].hash : undefined;

  const diff =
    oldestHash && newestHash
      ? await deps.getFileDiff(absPath, {
          cwd: options.cwd,
          baseRef: `${oldestHash}~1`,
          headRef: newestHash,
        })
      : { path: absPath, baseRef: "", headRef: "", diffText: "" };

  return { commits, diff };
}

function buildPrompt(
  displayPath: string,
  commits: GitHistoryCommit[],
  diff: GitDiffResult,
): string {
  const commitSection = commits
    .map(
      (c) =>
        `Commit: ${c.hash}\nAuthor: ${c.author.name}\nDate: ${c.authoredAt}\nSubject: ${c.subject}\nBody: ${c.body}`,
    )
    .join("\n---\n");

  return `다음은 "${displayPath}" 파일의 변경 커밋 정보와 diff입니다.

== 커밋 목록 ==
${commitSection || "(없음)"}

== Diff ==
${diff.diffText || "(없음)"}

위 정보를 보고, 각 변경에 대해 JSON으로 응답하세요:
{
  "changes": [
    {
      "section": "어느 부분이 변경됐는지",
      "author": "작성자 이름",
      "date": "YYYY-MM-DD",
      "what": "무엇이 변경됐는지 (1문장)",
      "why": "왜 변경했는지 추론 (1문장)",
      "impact": "low | medium | high"
    }
  ],
  "overall_summary": "전체 변경 요약 (1~2문장)",
  "breaking_changes": ["호환성 깨지는 변경이 있으면 기술"]
}

반드시 위 JSON 구조만 반환하세요.`;
}

function parseExplainResult(value: unknown): ExplainResult | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.changes)) return null;
  if (typeof obj.overall_summary !== "string") return null;
  if (!Array.isArray(obj.breaking_changes)) return null;

  const changes: ExplainChange[] = [];
  for (const raw of obj.changes) {
    if (typeof raw !== "object" || raw === null) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.section !== "string") return null;
    if (typeof item.author !== "string") return null;
    if (typeof item.date !== "string") return null;
    if (typeof item.what !== "string") return null;
    if (typeof item.why !== "string") return null;
    if (item.impact !== "low" && item.impact !== "medium" && item.impact !== "high") return null;

    changes.push({
      section: item.section,
      author: item.author,
      date: item.date,
      what: item.what,
      why: item.why,
      impact: item.impact,
    });
  }

  const breakingChanges: string[] = [];
  for (const bc of obj.breaking_changes as unknown[]) {
    if (typeof bc !== "string") return null;
    breakingChanges.push(bc);
  }

  return {
    changes,
    overall_summary: obj.overall_summary as string,
    breaking_changes: breakingChanges,
  };
}

const impactColors: Record<ExplainChange["impact"], (text: string) => string> = {
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.green,
};
