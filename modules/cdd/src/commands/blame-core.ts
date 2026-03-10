import path from "node:path";
import chalk from "chalk";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import {
  blameFile,
  type GitBlameReport,
  type GitHistoryCommit,
  listFileHistory,
} from "../utils/git.js";

// --- 타입 정의 ---

export interface BlameOptions {
  cwd: string;
  since?: string;
  until?: string;
}

export interface BlameDeps {
  listFileHistory: typeof listFileHistory;
  blameFile: typeof blameFile;
  callAi: typeof callAi;
}

export interface BlameContributor {
  name: string;
  commits: number;
  current_ownership_pct: number;
  score: number;
  role: string;
}

export interface BlameResult {
  primaryOwner: string;
  contributors: BlameContributor[];
}

interface ContributorData {
  name: string;
  commits: number;
  added: number;
  removed: number;
  blamedLines: number;
  commitMessages: string[];
}

export const defaultBlameDeps: BlameDeps = {
  listFileHistory,
  blameFile,
  callAi,
};

// --- 공개 함수 ---

export async function runBlame(
  absPath: string,
  options: BlameOptions,
  deps: BlameDeps,
): Promise<BlameResult> {
  const [history, blame] = await Promise.all([
    deps.listFileHistory(absPath, {
      cwd: options.cwd,
      since: options.since,
      until: options.until,
    }),
    deps.blameFile(absPath, {
      cwd: options.cwd,
      revision: options.until,
    }),
  ]);

  const contributorMap = buildContributorMap(history, blame);
  const contributors = scoreContributors(contributorMap);
  const enriched = await enrichWithAiRoles(contributors, history, absPath, options, deps);

  enriched.sort((a, b) => b.score - a.score);

  return {
    primaryOwner: enriched.length > 0 ? enriched[0].name : "",
    contributors: enriched,
  };
}

export function printBlamePretty(
  label: string,
  displayPath: string,
  primaryOwner: string,
  contributors: BlameContributor[],
): void {
  console.log(chalk.bold(`${label}: ${displayPath}`));
  console.log(`Primary owner: ${chalk.cyan(primaryOwner)}`);
  console.log();

  for (const c of contributors) {
    const scorePart = chalk.yellow(`[${c.score.toFixed(4)}]`);
    const namePart = chalk.bold(c.name);
    const commitsPart = chalk.dim(`${c.commits} commits`);
    const ownershipPart = chalk.dim(`${c.current_ownership_pct.toFixed(1)}% ownership`);
    const rolePart = c.role ? chalk.green(c.role) : chalk.dim("(no role)");

    console.log(`  ${scorePart} ${namePart}  ${commitsPart}, ${ownershipPart}`);
    console.log(`         ${rolePart}`);
  }
}

// --- 내부 함수 ---

function buildContributorMap(
  history: GitHistoryCommit[],
  blame: GitBlameReport,
): Map<string, ContributorData> {
  const map = new Map<string, ContributorData>();

  const getOrCreate = (name: string): ContributorData => {
    let entry = map.get(name);
    if (!entry) {
      entry = { name, commits: 0, added: 0, removed: 0, blamedLines: 0, commitMessages: [] };
      map.set(name, entry);
    }
    return entry;
  };

  for (const commit of history) {
    const contributor = getOrCreate(commit.author.name);
    contributor.commits += 1;
    contributor.added += commit.totalAdded;
    contributor.removed += commit.totalRemoved;
    contributor.commitMessages.push(commit.subject);
  }

  for (const line of blame.lines) {
    const contributor = getOrCreate(line.author.name);
    contributor.blamedLines += 1;
  }

  return map;
}

function scoreContributors(contributorMap: Map<string, ContributorData>): BlameContributor[] {
  const entries = Array.from(contributorMap.values());
  if (entries.length === 0) return [];

  const totalBlamedLines = entries.reduce((s, e) => s + e.blamedLines, 0);
  const totalAdded = entries.reduce((s, e) => s + e.added, 0);
  const totalRemoved = entries.reduce((s, e) => s + e.removed, 0);
  const maxCommits = Math.max(...entries.map((e) => e.commits));

  const baseWeights = {
    ownership: 0.5,
    added: 0.25,
    commitScore: 0.15,
    removed: 0.1,
  };

  let droppedWeight = 0;
  let activeCount = 0;
  const active = {
    ownership: totalBlamedLines > 0,
    added: totalAdded > 0,
    commitScore: maxCommits > 0,
    removed: totalRemoved > 0,
  };

  for (const [key, isActive] of Object.entries(active) as [keyof typeof active, boolean][]) {
    if (isActive) {
      activeCount += 1;
    } else {
      droppedWeight += baseWeights[key];
    }
  }

  const redistribute = activeCount > 0 ? droppedWeight / activeCount : 0;
  const weights = {
    ownership: active.ownership ? baseWeights.ownership + redistribute : 0,
    added: active.added ? baseWeights.added + redistribute : 0,
    commitScore: active.commitScore ? baseWeights.commitScore + redistribute : 0,
    removed: active.removed ? baseWeights.removed + redistribute : 0,
  };

  return entries.map((e) => {
    const ownershipShare = totalBlamedLines > 0 ? e.blamedLines / totalBlamedLines : 0;
    const addedShare = totalAdded > 0 ? e.added / totalAdded : 0;
    const commitScore = maxCommits > 0 ? Math.log1p(e.commits) / Math.log1p(maxCommits) : 0;
    const removedShare = totalRemoved > 0 ? e.removed / totalRemoved : 0;

    const score =
      weights.ownership * ownershipShare +
      weights.added * addedShare +
      weights.commitScore * commitScore +
      weights.removed * removedShare;

    return {
      name: e.name,
      commits: e.commits,
      current_ownership_pct: totalBlamedLines > 0 ? (e.blamedLines / totalBlamedLines) * 100 : 0,
      score: Math.round(score * 10000) / 10000,
      role: "",
    };
  });
}

async function enrichWithAiRoles(
  contributors: BlameContributor[],
  history: GitHistoryCommit[],
  absPath: string,
  options: BlameOptions,
  deps: BlameDeps,
): Promise<BlameContributor[]> {
  const commitsByAuthor = new Map<string, GitHistoryCommit[]>();
  for (const commit of history) {
    const existing = commitsByAuthor.get(commit.author.name);
    if (existing) {
      existing.push(commit);
    } else {
      commitsByAuthor.set(commit.author.name, [commit]);
    }
  }

  const authorsWithCommits = contributors.filter((c) => {
    const authorCommits = commitsByAuthor.get(c.name);
    return authorCommits && authorCommits.length > 0;
  });

  if (authorsWithCommits.length === 0) return contributors.map((c) => ({ ...c }));

  const authorSections = authorsWithCommits
    .map((c) => {
      const authorCommits = commitsByAuthor.get(c.name) ?? [];
      const commitList = authorCommits.map((ac) => `  - ${ac.subject}`).join("\n");
      return `[${c.name}]\n${commitList}`;
    })
    .join("\n\n");

  const prompt = [
    `다음은 "${path.basename(absPath)}" 파일에 대한 기여자별 커밋 목록입니다:`,
    "",
    authorSections,
    "",
    "각 기여자가 이 파일에서 수행한 역할을 한 줄로 요약해주세요.",
    "JSON으로 응답하세요. key는 기여자 이름, value는 역할 요약 문자열입니다.",
    '예: {"Alice": "초기 설계 및 핵심 플로우 작성", "Bob": "에러 처리 보강"}',
  ].join("\n");

  const result: AiCallResult<Record<string, string>> = await deps.callAi<Record<string, string>>({
    cwd: options.cwd,
    prompt,
    fallback: {},
    parse: (v) => {
      if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
      const obj = v as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === "string") out[key] = val;
      }
      return Object.keys(out).length > 0 ? out : null;
    },
  });

  const roleMap = result.value;
  return contributors.map((c) => ({
    ...c,
    role: roleMap[c.name] ?? "",
  }));
}
