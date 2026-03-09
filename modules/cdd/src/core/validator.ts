import path from "node:path";
import type { CddProject, SpecStatus, ValidationIssue } from "./types.js";
import {
  CONTRACT_REQUIRED_SECTIONS,
  SPEC_FEATURE_SUBSECTIONS,
  SPEC_REQUIRED_SECTIONS,
} from "./types.js";

const STATUS_ORDER: Record<SpecStatus, number> = {
  draft: 0,
  "in-progress": 1,
  done: 2,
};

/**
 * CDD 프로젝트 전체를 검증하고 이슈 목록을 반환한다.
 */
export function validateProject(project: CddProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const contract of project.contracts) {
    validateContractSections(contract.document.content, contract.path, issues);
    validateLastModified(contract.document.lastModified, contract.path, issues);
  }

  const contractPaths = new Set(project.contracts.map((c) => c.path));

  for (const spec of project.specs) {
    validateSpecSections(spec.document.content, spec.path, issues);
    validateSpecMetadata(spec.document, spec.path, issues);
    validateSpecFeatureBlocks(spec.document.content, spec.path, issues);
    validateStatusAggregation(spec.document.status, spec.document.revisions, spec.path, issues);
    validateSourcesSecurity(spec.document.sources, project.projectRoot, spec.path, issues);
    validateContractReferences(spec.resolvedContracts, contractPaths, spec.path, issues);
  }

  return issues;
}

/** Contract content 필수 섹션 헤딩 검증 */
function validateContractSections(
  content: string[],
  filePath: string,
  issues: ValidationIssue[],
): void {
  const headings = extractHeadings(content, 2);
  for (const section of CONTRACT_REQUIRED_SECTIONS) {
    if (!headings.includes(section)) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `Contract 필수 섹션 누락: "${section}"`,
      });
    }
  }
}

/** lastModified 형식 검증 */
function validateLastModified(
  lastModified: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastModified)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `lastModified 형식이 올바르지 않습니다: "${lastModified}" (YYYY-MM-DD 필요)`,
    });
  }
}

/** Spec content 필수 최상위 섹션 검증 */
function validateSpecSections(
  content: string[],
  filePath: string,
  issues: ValidationIssue[],
): void {
  const headings = extractHeadings(content, 2);
  for (const section of SPEC_REQUIRED_SECTIONS) {
    if (!headings.includes(section)) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `Spec 필수 섹션 누락: "${section}"`,
      });
    }
  }
}

/** Spec 메타데이터 존재 여부 검증 */
function validateSpecMetadata(
  doc: {
    lastModified: string;
    status: string;
    sources: string[];
    contracts: string[];
    revisions: unknown[];
  },
  filePath: string,
  issues: ValidationIssue[],
): void {
  validateLastModified(doc.lastModified, filePath, issues);

  if (!["draft", "in-progress", "done"].includes(doc.status)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `유효하지 않은 status 값: "${doc.status}"`,
    });
  }

  if (!doc.revisions || doc.revisions.length === 0) {
    issues.push({
      severity: "warning",
      path: filePath,
      message: "revisions가 비어 있습니다",
    });
  }
}

/** Feature 블록 구조 검증: ### 헤딩으로 분리 후 #### 하위 섹션 5개 필수 확인 */
function validateSpecFeatureBlocks(
  content: string[],
  filePath: string,
  issues: ValidationIssue[],
): void {
  const featureBlocks = extractFeatureBlocks(content);

  for (const block of featureBlocks) {
    const subHeadings = extractHeadings(block.lines, 4);
    for (const sub of SPEC_FEATURE_SUBSECTIONS) {
      if (!subHeadings.includes(sub)) {
        issues.push({
          severity: "error",
          path: filePath,
          message: `Feature "${block.name}" 필수 하위 섹션 누락: "${sub}"`,
        });
      }
    }
  }
}

/** top-level status = 최소 revision 상태 검증 */
function validateStatusAggregation(
  topStatus: SpecStatus,
  revisions: { status: SpecStatus }[],
  filePath: string,
  issues: ValidationIssue[],
): void {
  if (revisions.length === 0) return;

  const minStatus = revisions.reduce<SpecStatus>((min, rev) => {
    return STATUS_ORDER[rev.status] < STATUS_ORDER[min] ? rev.status : min;
  }, "done");

  if (topStatus !== minStatus) {
    issues.push({
      severity: "warning",
      path: filePath,
      message: `top-level status "${topStatus}"가 revision 최솟값 "${minStatus}"과 불일치합니다`,
    });
  }
}

/** sources 경로가 프로젝트 루트를 벗어나는지 검증 */
function validateSourcesSecurity(
  sources: string[],
  projectRoot: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const source of sources) {
    const resolved = path.resolve(projectRoot, source);
    const rel = path.relative(projectRoot, resolved);
    if (rel.startsWith("..")) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `sources 경로가 프로젝트 루트를 벗어납니다: "${source}"`,
      });
    }
  }
}

/** contracts 경로가 실존하는 contract 노드로 해소되는지 검증 */
function validateContractReferences(
  resolvedContracts: string[],
  knownContractPaths: Set<string>,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const rc of resolvedContracts) {
    if (!knownContractPaths.has(rc)) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `참조된 contract를 찾을 수 없습니다: "${rc}"`,
      });
    }
  }
}

/** 특정 레벨의 Markdown 헤딩 텍스트를 추출한다 */
function extractHeadings(content: string[], level: number): string[] {
  const prefix = `${"#".repeat(level)} `;
  return content
    .filter((line) => line.startsWith(prefix) && !line.startsWith(`${prefix}#`))
    .map((line) => line.slice(prefix.length).trim());
}

interface FeatureBlock {
  name: string;
  lines: string[];
}

/** ### 헤딩 기준으로 feature 블록을 분리한다 */
function extractFeatureBlocks(content: string[]): FeatureBlock[] {
  const blocks: FeatureBlock[] = [];
  let current: FeatureBlock | null = null;
  let inFeaturesSection = false;

  for (const line of content) {
    if (line.startsWith("## ") && !line.startsWith("## #")) {
      const heading = line.slice(3).trim();
      inFeaturesSection = heading === "Features";
      if (!inFeaturesSection && current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }

    if (!inFeaturesSection && current === null) continue;

    if (line.startsWith("### ") && !line.startsWith("### #")) {
      if (current) blocks.push(current);
      current = { name: line.slice(4).trim(), lines: [] };
      inFeaturesSection = true;
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) blocks.push(current);
  return blocks;
}
