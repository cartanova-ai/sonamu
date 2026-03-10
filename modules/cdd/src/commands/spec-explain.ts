import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import type { GitDiffResult, GitHistoryCommit } from "../utils/git.js";
import { getFileDiff, listFileHistory } from "../utils/git.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

export interface SpecExplainOptions {
  cwd: string;
  since?: string;
  until?: string;
  commit?: string;
}

export interface SpecExplainChange {
  section: string;
  author: string;
  date: string;
  what: string;
  why: string;
  impact: "low" | "medium" | "high";
}

export interface SpecExplainData {
  feature: string;
  changes: SpecExplainChange[];
  overall_summary: string;
  breaking_changes: string[];
}

export interface SpecExplainDeps {
  listFileHistory: typeof listFileHistory;
  getFileDiff: typeof getFileDiff;
  callAi: typeof callAi;
}

const defaultDeps: SpecExplainDeps = {
  listFileHistory,
  getFileDiff,
  callAi,
};

export async function runSpecExplain(
  specRef: string,
  options: SpecExplainOptions,
  project: CddProject,
  deps: SpecExplainDeps = defaultDeps,
): Promise<OutputResult> {
  const specNode = resolveSpec(specRef, project);
  const specAbsPath = specNode.path;

  const fallback: SpecExplainData = {
    feature: specAbsPath,
    changes: [],
    overall_summary: "",
    breaking_changes: [],
  };

  const context = options.commit
    ? await buildCommitContext(specAbsPath, options, deps)
    : await buildRangeContext(specAbsPath, options, deps);

  if (!context.diff.diffText && context.commits.length === 0) {
    return {
      data: fallback,
      pretty() {
        console.log(chalk.bold(`Spec: ${specAbsPath}`));
        console.log(chalk.dim("변경 이력이 없습니다."));
      },
    };
  }

  const prompt = buildPrompt(specAbsPath, context.commits, context.diff);

  const aiResult: AiCallResult<SpecExplainData> = await deps.callAi({
    cwd: options.cwd,
    prompt,
    fallback,
    parse: parseExplainResult,
  });

  const data: SpecExplainData = { ...aiResult.value, feature: specAbsPath };

  return {
    data,
    pretty() {
      printPretty(data);
    },
  };
}

interface ExplainContext {
  commits: GitHistoryCommit[];
  diff: GitDiffResult;
}

async function buildCommitContext(
  specAbsPath: string,
  options: SpecExplainOptions,
  deps: SpecExplainDeps,
): Promise<ExplainContext> {
  const commits = await deps.listFileHistory(specAbsPath, {
    cwd: options.cwd,
  });

  const targetCommit = commits.find((c) => c.hash === options.commit);
  const filteredCommits = targetCommit ? [targetCommit] : [];

  const diff = await deps.getFileDiff(specAbsPath, {
    cwd: options.cwd,
    commit: options.commit,
  });

  return { commits: filteredCommits, diff };
}

async function buildRangeContext(
  specAbsPath: string,
  options: SpecExplainOptions,
  deps: SpecExplainDeps,
): Promise<ExplainContext> {
  const commits = await deps.listFileHistory(specAbsPath, {
    cwd: options.cwd,
    since: options.since,
    until: options.until,
  });

  const oldestHash = commits.length > 0 ? commits[commits.length - 1].hash : undefined;
  const newestHash = commits.length > 0 ? commits[0].hash : undefined;

  const diff =
    oldestHash && newestHash
      ? await deps.getFileDiff(specAbsPath, {
          cwd: options.cwd,
          baseRef: `${oldestHash}~1`,
          headRef: newestHash,
        })
      : { path: specAbsPath, baseRef: "", headRef: "", diffText: "" };

  return { commits, diff };
}

function buildPrompt(specPath: string, commits: GitHistoryCommit[], diff: GitDiffResult): string {
  const commitSection = commits
    .map(
      (c) =>
        `Commit: ${c.hash}\nAuthor: ${c.author.name}\nDate: ${c.authoredAt}\nSubject: ${c.subject}\nBody: ${c.body}`,
    )
    .join("\n---\n");

  return `다음은 spec 파일 "${specPath}"의 변경 커밋 정보와 diff입니다.

== 커밋 목록 ==
${commitSection || "(없음)"}

== Diff ==
${diff.diffText || "(없음)"}

위 정보를 보고, 각 변경에 대해 JSON으로 응답하세요:
{
  "changes": [
    {
      "section": "어느 섹션이 변경됐는지",
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

function parseExplainResult(value: unknown): SpecExplainData | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.changes)) return null;
  if (typeof obj.overall_summary !== "string") return null;
  if (!Array.isArray(obj.breaking_changes)) return null;

  const changes: SpecExplainChange[] = [];
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
    feature: "",
    changes,
    overall_summary: obj.overall_summary as string,
    breaking_changes: breakingChanges,
  };
}

const impactColors: Record<SpecExplainChange["impact"], (text: string) => string> = {
  high: chalk.red,
  medium: chalk.yellow,
  low: chalk.green,
};

function printPretty(data: SpecExplainData): void {
  console.log(chalk.bold(`Spec: ${data.feature}`));
  if (data.overall_summary) {
    console.log(chalk.dim(data.overall_summary));
  }
  console.log();

  if (data.changes.length === 0) {
    console.log(chalk.dim("  변경 사항이 없습니다."));
  } else {
    for (const change of data.changes) {
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

  if (data.breaking_changes.length > 0) {
    console.log(chalk.red.bold("Breaking Changes:"));
    for (const bc of data.breaking_changes) {
      console.log(chalk.red(`  - ${bc}`));
    }
    console.log();
  }
}
