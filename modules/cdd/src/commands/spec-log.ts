import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import type { GitHistoryCommit } from "../utils/git.js";
import { listFileHistory } from "../utils/git.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

// --- 타입 정의 ---

export interface SpecLogOptions {
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

interface SpecLogData {
  feature: string;
  group_by: "day" | "week" | "month";
  timeline: TimelinePeriod[];
}

export interface SpecLogDeps {
  listFileHistory: typeof listFileHistory;
  callAi: typeof callAi;
}

// --- 공개 함수 ---

const defaultDeps: SpecLogDeps = { listFileHistory, callAi };

export async function runSpecLog(
  specRef: string | undefined,
  options: SpecLogOptions,
  project: CddProject,
  deps: SpecLogDeps = defaultDeps,
): Promise<OutputResult> {
  if (!specRef) {
    console.error(
      "사용법: cdd spec log <spec> [--since <date>] [--until <date>] [--group-by <day|week|month>]",
    );
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const commits = await deps.listFileHistory(spec.path, {
    cwd: options.cwd,
    since: options.since,
    until: options.until,
  });

  const grouped = groupCommitsByPeriod(commits, options.groupBy);
  const timeline = await buildTimeline(grouped, options, deps);

  const data: SpecLogData = {
    feature: spec.basename,
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

// --- 내부 함수: 그룹핑 ---

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

  // ISO week 계산
  return formatIsoWeek(date);
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** ISO 8601 week 번호를 계산합니다 */
function formatIsoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week: 목요일이 포함된 주가 해당 연도의 week
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
  options: SpecLogOptions,
  deps: SpecLogDeps,
): Promise<TimelinePeriod[]> {
  return Promise.all(
    groups.map(async (group) => {
      const authorGroups = groupByAuthor(group.commits);

      const byAuthor = await Promise.all(
        authorGroups.map(async (ag) => {
          const commitSummaries = ag.commits.map((c) => ({ hash: c.hash, message: c.subject }));
          const linesDelta = computeLinesDelta(ag.commits);
          const aiResult = await callAiForAuthorGroup(ag.author, commitSummaries, options, deps);

          return {
            author: ag.author,
            commits: commitSummaries,
            lines_delta: linesDelta,
            summary: aiResult.summary,
            phase: aiResult.phase,
          };
        }),
      );

      return {
        period: group.period,
        lines_delta: computeLinesDelta(group.commits),
        by_author: byAuthor,
      };
    }),
  );
}

// --- 내부 함수: AI 호출 ---

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

function parseAiResponse(value: unknown): AiSummaryResult | null {
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.summary !== "string") return null;
  if (typeof obj.phase !== "string") return null;
  if (!VALID_PHASES.has(obj.phase)) return null;
  return { summary: obj.summary, phase: obj.phase as Phase };
}

async function callAiForAuthorGroup(
  author: string,
  commits: Array<{ hash: string; message: string }>,
  options: SpecLogOptions,
  deps: SpecLogDeps,
): Promise<AiSummaryResult> {
  const fallback: AiSummaryResult = { summary: "", phase: "" };
  const commitList = commits.map((c) => `- ${c.message}`).join("\n");

  const prompt = [
    `다음은 "${author}"의 커밋 목록입니다:`,
    commitList,
    "",
    "위 커밋들을 분석하여 JSON으로 응답하세요:",
    '- "summary": 작업 내용 1~2문장 요약',
    '- "phase": 다음 중 하나: "drafting", "in-progress", "reviewing", "refining", "hotfix", "restructuring"',
  ].join("\n");

  const result: AiCallResult<AiSummaryResult> = await deps.callAi({
    cwd: options.cwd,
    prompt,
    fallback,
    parse: parseAiResponse,
    jsonSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        phase: {
          type: "string",
          enum: ["drafting", "in-progress", "reviewing", "refining", "hotfix", "restructuring"],
        },
      },
      required: ["summary", "phase"],
    },
  });

  return result.value;
}

// --- 내부 함수: Pretty 출력 ---

function printTimelinePretty(data: SpecLogData): void {
  console.log(chalk.bold(`Spec Log: ${data.feature}`));
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
