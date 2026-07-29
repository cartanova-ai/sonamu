/**
 * 스킬 문서 크기 상한 검사.
 *
 * 배경: testing.md는 한 달 만에 2,326 → 2,950줄로 누적됐고, 수동 중복 제거
 * 패스 한 번(-752줄)으로 겨우 회수됐다. 사람 리뷰로는 축적을 막지 못하므로
 * 기계적 상한을 둔다.
 *
 * 규칙:
 * - SKILL.md는 진입점 전용. 새 내용은 references/에 추가한다.
 * - reference 문서가 상한을 넘으면 주제를 쪼갠다.
 */
import { readdir, readFile } from "fs/promises";
import path from "path";
import process from "process";

const SKILLS_ROOT = path.resolve(import.meta.dirname, "..", "modules", "sonamu", "src", "skills");

// Expo(최대 19.1KB)와 Vercel(최대 17.3KB) 실측 스킬 크기에서 도출한 상한.
// 줄 수가 아니라 바이트로 재는 이유는 토큰 비용이 바이트에 더 가깝기 때문이다.
const SKILL_MD_MAX_BYTES = 20_000;
const REFERENCE_MAX_BYTES = 20_000;

type Violation = {
  file: string;
  bytes: number;
  limit: number;
};

async function countBytes(filePath: string): Promise<number> {
  return Buffer.byteLength(await readFile(filePath, "utf-8"), "utf-8");
}

async function collectMarkdown(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdown(full)));
    } else if (entry.name.endsWith(".md")) {
      files.push(full);
    }
  }

  return files;
}

async function main() {
  const skillDirs = (await readdir(SKILLS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("sonamu-"))
    .map((entry) => path.join(SKILLS_ROOT, entry.name));

  const violations: Violation[] = [];

  for (const skillDir of skillDirs) {
    for (const file of await collectMarkdown(skillDir)) {
      const limit = path.basename(file) === "SKILL.md" ? SKILL_MD_MAX_BYTES : REFERENCE_MAX_BYTES;
      const bytes = await countBytes(file);
      if (bytes > limit) {
        violations.push({ file: path.relative(process.cwd(), file), bytes, limit });
      }
    }
  }

  if (violations.length === 0) {
    console.log(`✓ skill size check passed (${skillDirs.length} skills)`);
    return;
  }

  console.error("✗ skill size check failed\n");
  for (const { file, bytes, limit } of violations) {
    console.error(`  ${file}: ${bytes} bytes (limit ${limit})`);
  }
  console.error(
    "\n  SKILL.md는 진입점 전용입니다. 상세 내용은 references/ 아래로 분리하고,\n" +
      "  reference가 상한을 넘으면 주제 단위로 다시 쪼개세요.",
  );
  process.exit(1);
}

await main();
