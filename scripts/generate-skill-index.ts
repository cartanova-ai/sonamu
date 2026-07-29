/**
 * 스킬 인덱스 생성기.
 *
 * 개별 스킬의 description은 각자의 발동 순간에만 걸린다. 어느 스킬에도 딱
 * 들어맞지 않는 작업에서는 아무것도 안 걸리므로, 넓은 트리거를 가진 루트 스킬
 * `sonamu`에 라우팅 테이블을 둬서 그물에서 빠진 경우를 받는다.
 *
 * 표는 각 SKILL.md의 frontmatter를 단일 소스로 삼아 생성한다. 손으로 유지하면
 * 드리프트가 확정이다. `--check`는 생성 결과가 현재 파일과 다르면 실패한다.
 */
import { readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import process from "process";

const SKILLS_ROOT = path.resolve(import.meta.dirname, "..", "modules", "sonamu", "src", "skills");
/** 라우팅 테이블을 담는 루트 스킬. 자기 자신은 표에 넣지 않는다. */
const ROOT_SKILL = "sonamu";
const TARGET = path.join(SKILLS_ROOT, ROOT_SKILL, "SKILL.md");

const START = "<!-- SKILL-INDEX:START -->";
const END = "<!-- SKILL-INDEX:END -->";

type SkillMeta = {
  name: string;
  /** description에서 추출한 트리거 문장 */
  trigger: string;
};

/**
 * frontmatter에서 name과 description을 읽습니다.
 */
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) {
    return {};
  }

  const result: { name?: string; description?: string } = {};
  for (const line of match[1].split("\n")) {
    const kv = /^(name|description):\s*(.*)$/.exec(line);
    if (kv) {
      result[kv[1] as "name" | "description"] = kv[2].trim();
    }
  }
  return result;
}

/**
 * description에서 트리거 문장만 뽑아냅니다.
 *
 * 인덱스는 "무엇인가"가 아니라 "언제 쓰는가"를 보여야 하므로,
 * "Use when ..." 문장이 있으면 그 부분을 우선 사용합니다.
 */
function extractTrigger(description: string): string {
  const useWhen = /\bUse when\b(.*)$/is.exec(description);
  const raw = useWhen ? useWhen[1] : description;
  return raw
    .trim()
    .replace(/^[,:\s]+/, "")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
}

async function collectSkills(): Promise<SkillMeta[]> {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const skills: SkillMeta[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("sonamu-")) {
      continue;
    }
    if (entry.name === ROOT_SKILL) {
      continue;
    }

    const skillPath = path.join(SKILLS_ROOT, entry.name, "SKILL.md");
    let content: string;
    try {
      content = await readFile(skillPath, "utf-8");
    } catch {
      continue;
    }

    const { name, description } = parseFrontmatter(content);
    if (!name || !description) {
      throw new Error(`${entry.name}/SKILL.md is missing frontmatter name or description`);
    }
    skills.push({ name, trigger: extractTrigger(description) });
  }

  return skills.toSorted((a, b) => a.name.localeCompare(b.name));
}

function renderIndex(skills: SkillMeta[]): string {
  const rows = skills.map((s) => `| ${s.trigger} | \`${s.name}\` |`);
  return [START, "", "| Situation | Skill |", "| --- | --- |", ...rows, "", END].join("\n");
}

async function main() {
  const isCheck = process.argv.includes("--check");
  const skills = await collectSkills();

  if (skills.length === 0) {
    throw new Error(`no sonamu-* skills found under ${SKILLS_ROOT}`);
  }

  const current = await readFile(TARGET, "utf-8");
  const startIdx = current.indexOf(START);
  const endIdx = current.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
    throw new Error(`${TARGET} is missing the SKILL-INDEX markers`);
  }

  const next =
    current.slice(0, startIdx) + renderIndex(skills) + current.slice(endIdx + END.length);

  if (next === current) {
    console.log(`✓ skill index up to date (${skills.length} skills)`);
    return;
  }

  if (isCheck) {
    console.error("✗ skill index is stale\n");
    console.error("  Run: pnpm skills:index");
    process.exit(1);
  }

  await writeFile(TARGET, next);
  console.log(`✓ skill index generated (${skills.length} skills)`);
}

await main();
