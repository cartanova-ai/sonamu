import type {
  CddProject,
  ContractDocument,
  SpecDocument,
  SpecStatus,
  ValidationIssue,
} from "./types.js";
import { VALID_STATUSES } from "./types.js";
import { findMissingResolvedPaths, findSourcesOutsideRoot } from "./validation-shared.js";

/**
 * CDD 프로젝트 전체를 검증하고 이슈 목록을 반환한다.
 */
export function validateProject(project: CddProject): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const contract of project.contracts) {
    validateContractFields(contract.document, contract.path, issues);
    validateLastModified(contract.document.lastModified, contract.path, issues);
  }

  const contractPaths = new Set(project.contracts.map((c) => c.path));
  const specPaths = new Set(project.specs.map((s) => s.path));

  for (const spec of project.specs) {
    validateSpecRequiredFields(spec.document, spec.path, issues);
    validateLastModified(spec.document.lastModified, spec.path, issues);
    validateSpecStatus(spec.document.status, spec.path, issues);
    validateAcceptanceCriteriaStructure(spec.document, spec.path, issues);
    validateSourcesSecurity(spec.document.sources, project.projectRoot, spec.path, issues);
    validateContractReferences(spec.resolvedContracts, contractPaths, spec.path, issues);
    validateDependsOnSpecsReferences(spec.resolvedDependsOnSpecs, specPaths, spec.path, issues);
  }

  return issues;
}

/** Contract 필수 필드 검증 */
function validateContractFields(
  doc: ContractDocument,
  filePath: string,
  issues: ValidationIssue[],
): void {
  if (doc.overview.length === 0) {
    issues.push({
      severity: "warning",
      path: filePath,
      message: "Contract overview가 비어 있습니다",
    });
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

/** Spec 필수 필드 존재 및 타입 검증 */
function validateSpecRequiredFields(
  doc: SpecDocument,
  filePath: string,
  issues: ValidationIssue[],
): void {
  if (typeof doc.schemaVersion !== "number") {
    issues.push({
      severity: "error",
      path: filePath,
      message: "schemaVersion 필드가 누락되었거나 숫자가 아닙니다",
    });
  }
  if (typeof doc.summary !== "string" || doc.summary.length === 0) {
    issues.push({
      severity: "warning",
      path: filePath,
      message: "summary가 비어 있습니다",
    });
  }
}

/** Spec status 값 유효성 검증 */
function validateSpecStatus(status: string, filePath: string, issues: ValidationIssue[]): void {
  if (!VALID_STATUSES.includes(status as SpecStatus)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `유효하지 않은 status 값: "${status}"`,
    });
  }
}

/** acceptanceCriteria 구조 검증 */
function validateAcceptanceCriteriaStructure(
  doc: SpecDocument,
  filePath: string,
  issues: ValidationIssue[],
): void {
  const criteria = doc.acceptanceCriteria as unknown[];
  if (!Array.isArray(criteria)) return;

  const seenIds = new Set<string>();

  for (const [i, item] of criteria.entries()) {
    if (typeof item !== "object" || item === null) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `acceptanceCriteria[${i}]: 객체여야 합니다`,
      });
      continue;
    }

    const ac = item as Record<string, unknown>;
    if (typeof ac.id !== "string" || ac.id.length === 0) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `acceptanceCriteria[${i}]: id가 필요합니다`,
      });
    } else {
      if (seenIds.has(ac.id)) {
        issues.push({
          severity: "error",
          path: filePath,
          message: `acceptanceCriteria: 중복된 id "${ac.id}"`,
        });
      }
      seenIds.add(ac.id);
    }

    if (typeof ac.condition !== "string" || ac.condition.length === 0) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `acceptanceCriteria[${i}]: condition이 필요합니다`,
      });
    }

    if (typeof ac.testRef !== "object" || ac.testRef === null) {
      issues.push({
        severity: "error",
        path: filePath,
        message: `acceptanceCriteria[${i}]: testRef가 필요합니다`,
      });
    } else {
      const testRef = ac.testRef as Record<string, unknown>;
      if (typeof testRef.target !== "string") {
        issues.push({
          severity: "error",
          path: filePath,
          message: `acceptanceCriteria[${i}]: testRef.target이 필요합니다`,
        });
      }
      if (typeof testRef.pattern !== "string") {
        issues.push({
          severity: "error",
          path: filePath,
          message: `acceptanceCriteria[${i}]: testRef.pattern이 필요합니다`,
        });
      }
    }
  }
}

/** sources 경로가 프로젝트 루트를 벗어나는지 검증 */
function validateSourcesSecurity(
  sources: string[],
  projectRoot: string,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const source of findSourcesOutsideRoot(sources, projectRoot)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `sources 경로가 프로젝트 루트를 벗어납니다: "${source}"`,
    });
  }
}

/** contracts 경로가 실존하는 contract 노드로 해소되는지 검증 */
function validateContractReferences(
  resolvedContracts: string[],
  knownContractPaths: Set<string>,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const rc of findMissingResolvedPaths(resolvedContracts, knownContractPaths)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `참조된 contract를 찾을 수 없습니다: "${rc}"`,
    });
  }
}

/** dependsOnSpecs 경로가 실존하는 spec 노드로 해소되는지 검증 */
function validateDependsOnSpecsReferences(
  resolvedDependsOnSpecs: string[],
  knownSpecPaths: Set<string>,
  filePath: string,
  issues: ValidationIssue[],
): void {
  for (const rd of findMissingResolvedPaths(resolvedDependsOnSpecs, knownSpecPaths)) {
    issues.push({
      severity: "error",
      path: filePath,
      message: `참조된 spec을 찾을 수 없습니다: "${rd}"`,
    });
  }
}
