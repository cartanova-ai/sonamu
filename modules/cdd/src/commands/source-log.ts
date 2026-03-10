import path from "node:path";
import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import type { GitHistoryCommit } from "../utils/git.js";
import { listFileHistory } from "../utils/git.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSourcePath } from "./impact.js";
import { groupCommitsByPeriod } from "./spec-log.js";

export interface SourceLogOptions {
  cwd: string;
  since?: string;
  until?: string;
  groupBy: "day" | "week" | "month";
}

type Phase =
  | "drafting"
  | "in-progress"
  | "reviewing"
  | "refining"
  | "hotfix"
  | "restructuring"
  | "";

interface AuthorGroup {
  author: string;
  commits: Array<{ hash: string; message: string }>;
  lines_delta: string;
  summary: string;
  phase: Phase;
}

interface TimelinePeriod {
  period: string;
  lines_delta: string;
  by_author: AuthorGroup[];
}

interface SourceLogData {
  source: string;
  group_by: "day" | "week" | "month";
  timeline: TimelinePeriod[];
}

export interface SourceLogDeps {
  listFileHistory: typeof listFileHistory;
  callAi: typeof callAi;
}

const defaultDeps: SourceLogDeps = { listFileHistory, callAi };

export async function runSourceLog(
  sourceRef: string | undefined,
  options: SourceLogOptions,
  project: CddProject,
  deps: SourceLogDeps = defaultDeps,
): Promise<OutputResult> {
  if (!sourceRef) {
    console.error(
      "사용법: cdd source log <file> [--since <date>] [--until <date>] [--group-by <day|week|month>]",
    );
    process.exit(1);
  }

  const sourcePath = resolveSourcePath(sourceRef, project);
  const sourceAbsPath = path.resolve(project.projectRoot, sourcePath);

  const commits = await deps.listFileHistory(sourceAbsPath, {
    cwd: options.cwd,
    since: options.since,
    until: options.until,
  });

  const grouped = groupCommitsByPeriod(commits, options.groupBy);
  const timeline = await buildTimeline(grouped, options, deps);

  const data: SourceLogData = {
    source: sourcePath,
    group_by: options.groupBy,
    timeline,
  };

  return {
    data,
    pretty() {
      printTimelinePretty(data);
    },
  };
}

// --- 내부 함수: 타임라인 빌드 ---

interface PeriodGroup {
  period: string;
  commits: GitHistoryCommit[];
}

interface AuthorCommitsGroup {
  author: string;
  commits: GitHistoryCommit[];
}

function groupByAuthor(commits: GitHistoryCommit[]): AuthorCommitsGroup[] {
  const map = new Map<string, GitHistoryCommit[]>();

  for (const commit of commits) {
    const name = commit.author.name;
    const list = map.get(name);
    if (list) {
      list.push(commit);
    } else {
      map.set(name, [commit]);
    }
  }

  return Array.from(map.entries()).map(([author, authorCommits]) => ({
    author,
    commits: authorCommits,
  }));
}

function computeLinesDelta(commits: GitHistoryCommit[]): string {
  let added = 0;
  let removed = 0;
  for (const c of commits) {
    added += c.totalAdded;
    removed += c.totalRemoved;
  }
  return `+${added} -${removed}`;
}

async function buildTimeline(
  groups: PeriodGroup[],
  options: SourceLogOptions,
  deps: SourceLogDeps,
): Promise<TimelinePeriod[]> {
  const periodsData = groups.map((group) => ({
    period: group.period,
    linesDelta: computeLinesDelta(group.commits),
    authorGroups: groupByAuthor(group.commits),
  }));

  const entries: BatchEntry[] = periodsData.flatMap((pd) =>
    pd.authorGroups.map((ag) => ({
      key: `${pd.period}::${ag.author}`,
      author: ag.author,
      commits: ag.commits.map((c) => ({ hash: c.hash, message: c.subject })),
    })),
  );

  const aiResults = await callAiBatchSummary(entries, options, deps);

  return periodsData.map((pd) => ({
    period: pd.period,
    lines_delta: pd.linesDelta,
    by_author: pd.authorGroups.map((ag) => {
      const key = `${pd.period}::${ag.author}`;
      const aiResult = aiResults.get(key) ?? { summary: "", phase: "" as Phase };
      return {
        author: ag.author,
        commits: ag.commits.map((c) => ({ hash: c.hash, message: c.subject })),
        lines_delta: computeLinesDelta(ag.commits),
        summary: aiResult.summary,
        phase: aiResult.phase,
      };
    }),
  }));
}

// --- 내부 함수: AI 배치 호출 ---

interface AiSummaryResult {
  summary: string;
  phase: Phase;
}

const VALID_PHASES = new Set<string>([
  "drafting",
  "in-progress",
  "reviewing",
  "refining",
  "hotfix",
  "restructuring",
]);

interface BatchEntry {
  key: string;
  author: string;
  commits: Array<{ hash: string; message: string }>;
}

async function callAiBatchSummary(
  entries: BatchEntry[],
  options: SourceLogOptions,
  deps: SourceLogDeps,
): Promise<Map<string, AiSummaryResult>> {
  const fallbackMap = new Map<string, AiSummaryResult>();
  if (entries.length === 0) return fallbackMap;

  const sections = entries
    .map((e) => {
      const commitList = e.commits.map((c) => `  - ${c.message}`).join("\n");
      return `[${e.key}] (${e.author})\n${commitList}`;
    })
    .join("\n\n");

  const prompt = [
    "다음은 기간별 작성자의 커밋 목록입니다. 각 그룹을 분석하여 JSON으로 응답하세요.",
    "",
    sections,
    "",
    "응답 형식: key는 각 그룹의 [key] 값, value는 { summary, phase } 객체입니다.",
    'phase는 다음 중 하나: "drafting", "in-progress", "reviewing", "refining", "hotfix", "restructuring"',
    "summary는 해당 작성자가 이 기간에 한 작업을 1~2문장으로 요약합니다.",
    '예: {"2025-01-15::Alice": {"summary": "초기 스펙 작성", "phase": "drafting"}}',
  ].join("\n");

  const result: AiCallResult<Record<string, AiSummaryResult>> = await deps.callAi({
    cwd: options.cwd,
    prompt,
    fallback: {},
    parse: parseBatchResponse,
  });

  return new Map(Object.entries(result.value));
}

function parseBatchResponse(value: unknown): Record<string, AiSummaryResult> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const out: Record<string, AiSummaryResult> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val !== "object" || val === null) continue;
    const entry = val as Record<string, unknown>;
    if (typeof entry.summary !== "string") continue;
    if (typeof entry.phase !== "string" || !VALID_PHASES.has(entry.phase)) continue;
    out[key] = { summary: entry.summary, phase: entry.phase as Phase };
  }

  return Object.keys(out).length > 0 ? out : null;
}

// --- 내부 함수: Pretty 출력 ---

function printTimelinePretty(data: SourceLogData): void {
  console.log(chalk.bold(`Source Log: ${data.source}`));
  console.log(`  ${chalk.dim("group_by")} ${data.group_by}`);
  console.log();

  for (const period of data.timeline) {
    console.log(chalk.bold.cyan(`[${period.period}]`) + chalk.dim(` ${period.lines_delta}`));

    for (const ag of period.by_author) {
      console.log(`  ${chalk.white(ag.author)} ${chalk.dim(ag.lines_delta)}`);
      for (const c of ag.commits) {
        console.log(`    ${chalk.dim(c.hash.slice(0, 7))} ${c.message}`);
      }
      if (ag.summary) {
        console.log(`    ${chalk.green("summary:")} ${ag.summary}`);
      }
      if (ag.phase) {
        console.log(`    ${chalk.yellow("phase:")} ${ag.phase}`);
      }
    }
    console.log();
  }
}
