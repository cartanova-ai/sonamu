import path from "node:path";
import chalk from "chalk";
import type { CddProject } from "../core/types.js";
import type { AiCallResult } from "../utils/ai.js";
import { callAi } from "../utils/ai.js";
import {
  blameFile,
  type GitBlameReport,
  type GitHistoryCommit,
  listFileHistory,
} from "../utils/git.js";
import type { OutputResult } from "../utils/output.js";
import { resolveSpec } from "../utils/resolve.js";

export interface SpecBlameOptions {
  cwd: string;
  since?: string;
  until?: string;
}

export interface SpecBlameDeps {
  listFileHistory: typeof listFileHistory;
  blameFile: typeof blameFile;
  callAi: typeof callAi;
}

interface ContributorData {
  name: string;
  commits: number;
  added: number;
  removed: number;
  blamedLines: number;
  commitMessages: string[];
}

interface SpecBlameContributor {
  name: string;
  commits: number;
  current_ownership_pct: number;
  score: number;
  role: string;
}

interface SpecBlameData {
  feature: string;
  primary_owner: string;
  contributors: SpecBlameContributor[];
}

const defaultDeps: SpecBlameDeps = {
  listFileHistory,
  blameFile,
  callAi,
};

export async function runSpecBlame(
  specRef: string | undefined,
  options: SpecBlameOptions,
  project: CddProject,
  deps: SpecBlameDeps = defaultDeps,
): Promise<OutputResult> {
  if (!specRef) {
    console.error("사용법: cdd spec blame <spec> [--since <date>] [--until <rev>]");
    process.exit(1);
  }

  const spec = resolveSpec(specRef, project);
  const specAbsPath = spec.path;

  const [history, blame] = await Promise.all([
    deps.listFileHistory(specAbsPath, {
      cwd: options.cwd,
      since: options.since,
      until: options.until,
    }),
    deps.blameFile(specAbsPath, {
      cwd: options.cwd,
      revision: options.until,
    }),
  ]);

  const contributorMap = buildContributorMap(history, blame);
  const contributors = await scoreContributors(contributorMap, blame.totalLines);
  const enriched = await enrichWithAiRoles(contributors, history, specAbsPath, options, deps);

  enriched.sort((a, b) => b.score - a.score);

  const feature = spec.basename;
  const primaryOwner = enriched.length > 0 ? enriched[0].name : "";

  const data: SpecBlameData = {
    feature,
    primary_owner: primaryOwner,
    contributors: enriched,
  };

  return {
    data,
    pretty() {
      printBlamePretty(data, specAbsPath, project);
    },
  };
}

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

/** 가중치 기반 점수 산출. zero-total 항목은 잔여 가중치를 비례 재분배합니다. */
function scoreContributors(
  contributorMap: Map<string, ContributorData>,
  _totalBlamedLines: number,
): SpecBlameContributor[] {
  const entries = Array.from(contributorMap.values());
  if (entries.length === 0) return [];

  const totalBlamedLines = entries.reduce((s, e) => s + e.blamedLines, 0);
  const totalAdded = entries.reduce((s, e) => s + e.added, 0);
  const totalRemoved = entries.reduce((s, e) => s + e.removed, 0);
  const maxCommits = Math.max(...entries.map((e) => e.commits));

  // 활성 가중치 결정 (zero-total인 항은 제외 후 비례 재분배)
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
  contributors: SpecBlameContributor[],
  history: GitHistoryCommit[],
  specAbsPath: string,
  options: SpecBlameOptions,
  deps: SpecBlameDeps,
): Promise<SpecBlameContributor[]> {
  const commitsByAuthor = new Map<string, GitHistoryCommit[]>();
  for (const commit of history) {
    const existing = commitsByAuthor.get(commit.author.name);
    if (existing) {
      existing.push(commit);
    } else {
      commitsByAuthor.set(commit.author.name, [commit]);
    }
  }

  // 커밋 이력이 있는 기여자만 AI 분석 대상으로 합니다.
  const authorsWithCommits = contributors.filter((c) => {
    const authorCommits = commitsByAuthor.get(c.name);
    return authorCommits && authorCommits.length > 0;
  });

  if (authorsWithCommits.length === 0) return contributors.map((c) => ({ ...c }));

  // 모든 기여자를 하나의 배치 프롬프트로 분석합니다.
  const authorSections = authorsWithCommits
    .map((c) => {
      const authorCommits = commitsByAuthor.get(c.name) ?? [];
      const commitList = authorCommits.map((ac) => `  - ${ac.subject}`).join("\n");
      return `[${c.name}]\n${commitList}`;
    })
    .join("\n\n");

  const prompt = [
    `다음은 "${path.basename(specAbsPath)}" 파일에 대한 기여자별 커밋 목록입니다:`,
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

function printBlamePretty(data: SpecBlameData, specAbsPath: string, project: CddProject): void {
  const rel = path.relative(project.projectRoot, specAbsPath);
  console.log(chalk.bold(`Spec: ${rel}`));
  console.log(`Primary owner: ${chalk.cyan(data.primary_owner)}`);
  console.log();

  for (const c of data.contributors) {
    const scorePart = chalk.yellow(`[${c.score.toFixed(4)}]`);
    const namePart = chalk.bold(c.name);
    const commitsPart = chalk.dim(`${c.commits} commits`);
    const ownershipPart = chalk.dim(`${c.current_ownership_pct.toFixed(1)}% ownership`);
    const rolePart = c.role ? chalk.green(c.role) : chalk.dim("(no role)");

    console.log(`  ${scorePart} ${namePart}  ${commitsPart}, ${ownershipPart}`);
    console.log(`         ${rolePart}`);
  }
}
