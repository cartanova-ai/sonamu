import chalk from "chalk";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import type { GitHistoryCommit } from "../utils/git.js";
import { listFileHistory } from "../utils/git.js";

// --- 타입 정의 ---

export interface LogOptions {
  cwd: string;
  since?: string;
  until?: string;
  groupBy: "day" | "week" | "month";
}

export interface LogDeps {
  listFileHistory: typeof listFileHistory;
  callAi: typeof callAi;
}

export interface LogAuthorGroup {
  author: string;
  commits: Array<{ hash: string; message: string }>;
  lines_delta: string;
  summary: string;
}

export interface LogTimelinePeriod {
  period: string;
  lines_delta: string;
  by_author: LogAuthorGroup[];
}

export interface LogResult {
  groupBy: "day" | "week" | "month";
  timeline: LogTimelinePeriod[];
}

export const defaultLogDeps: LogDeps = { listFileHistory, callAi };

// --- 공개 함수 ---

export async function runLog(
  absPath: string,
  options: LogOptions,
  deps: LogDeps,
): Promise<LogResult> {
  const commits = await deps.listFileHistory(absPath, {
    cwd: options.cwd,
    since: options.since,
    until: options.until,
  });

  const grouped = groupCommitsByPeriod(commits, options.groupBy);
  const timeline = await buildTimeline(grouped, options, deps);

  return { groupBy: options.groupBy, timeline };
}

export function printLogPretty(
  label: string,
  displayName: string,
  groupBy: string,
  timeline: LogTimelinePeriod[],
): void {
  console.log(chalk.bold(`${label} Log: ${displayName}`));
  console.log(`  ${chalk.dim("group_by")} ${groupBy}`);
  console.log();

  for (const period of timeline) {
    console.log(chalk.bold.cyan(`[${period.period}]`) + chalk.dim(` ${period.lines_delta}`));

    for (const ag of period.by_author) {
      console.log(`  ${chalk.white(ag.author)} ${chalk.dim(ag.lines_delta)}`);
      for (const c of ag.commits) {
        console.log(`    ${chalk.dim(c.hash.slice(0, 7))} ${c.message}`);
      }
      if (ag.summary) {
        console.log(`    ${chalk.green("summary:")} ${ag.summary}`);
      }
    }
    console.log();
  }
}

// --- 그룹핑 함수 (외부 테스트에서도 사용) ---

interface PeriodGroup {
  period: string;
  commits: GitHistoryCommit[];
}

export function groupCommitsByPeriod(
  commits: GitHistoryCommit[],
  groupBy: "day" | "week" | "month",
): PeriodGroup[] {
  const map = new Map<string, GitHistoryCommit[]>();

  for (const commit of commits) {
    const key = toPeriodKey(commit.authoredAt, groupBy);
    const list = map.get(key);
    if (list) {
      list.push(commit);
    } else {
      map.set(key, [commit]);
    }
  }

  const entries = Array.from(map.entries());
  entries.sort((a, b) => a[0].localeCompare(b[0]));

  return entries.map(([period, periodCommits]) => ({ period, commits: periodCommits }));
}

export function toPeriodKey(authoredAt: string, groupBy: "day" | "week" | "month"): string {
  const date = new Date(authoredAt);

  if (groupBy === "day") {
    return formatDate(date);
  }

  if (groupBy === "month") {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  return formatIsoWeek(date);
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatIsoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// --- 내부 함수: 타임라인 빌드 ---

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
  options: LogOptions,
  deps: LogDeps,
): Promise<LogTimelinePeriod[]> {
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
      const aiResult = aiResults.get(key) ?? "";
      return {
        author: ag.author,
        commits: ag.commits.map((c) => ({ hash: c.hash, message: c.subject })),
        lines_delta: computeLinesDelta(ag.commits),
        summary: aiResult,
      };
    }),
  }));
}

// --- 내부 함수: AI 배치 호출 ---

interface BatchEntry {
  key: string;
  author: string;
  commits: Array<{ hash: string; message: string }>;
}

async function callAiBatchSummary(
  entries: BatchEntry[],
  options: LogOptions,
  deps: LogDeps,
): Promise<Map<string, string>> {
  const fallbackMap = new Map<string, string>();
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
    "응답 형식: key는 각 그룹의 [key] 값, value는 해당 작성자가 이 기간에 한 작업을 1~2문장으로 요약한 문자열입니다.",
    '예: {"2025-01-15::Alice": "초기 스펙 작성 및 인증 모듈 구현"}',
  ].join("\n");

  const result: AiCallResult<Record<string, string>> = await deps.callAi({
    cwd: options.cwd,
    prompt,
    fallback: {},
    parse: parseBatchResponse,
  });

  return new Map(Object.entries(result.value));
}

function parseBatchResponse(value: unknown): Record<string, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const out: Record<string, string> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val !== "string") continue;
    out[key] = val;
  }

  return Object.keys(out).length > 0 ? out : null;
}
