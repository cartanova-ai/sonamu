/** Spec 상태 */
export type SpecStatus = "draft" | "specifying" | "implementing" | "validating" | "done";

/** 유효한 상태 목록 */
export const VALID_STATUSES: SpecStatus[] = [
  "draft",
  "specifying",
  "implementing",
  "validating",
  "done",
];

/** 상태 순서 (전진 방향). 인접한 상태로만 전환 가능. */
export const STATUS_ORDER: readonly SpecStatus[] = [
  "draft",
  "specifying",
  "implementing",
  "validating",
  "done",
] as const;

/** Acceptance Criterion 테스트 참조 */
export interface AcceptanceCriterionTestRef {
  /** 테스트 파일 경로 (프로젝트 루트 기준) */
  target: string;
  /** 테스트 케이스 매칭 정규식 */
  pattern: string;
}

/** 구조화된 Acceptance Criterion */
export interface AcceptanceCriterion {
  /** 고유 식별자 */
  id: string;
  /** 검증 조건 */
  condition: string;
  /** 테스트 참조 */
  testRef: AcceptanceCriterionTestRef;
}

/** Contract JSON 문서 구조 */
export interface ContractDocument {
  schema: string;
  lastModified: string;
  features: Record<string, string>;
  overview: string[];
  domainGlossary: string[];
  userRoles: string[];
  businessRules: string[];
  edgeCases: string[];
}

/** Spec JSON 문서 구조 */
export interface SpecDocument {
  schemaVersion: number;
  summary: string;
  description: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  lastModified: string;
  status: SpecStatus;
  sources: string[];
  contracts: string[];
  dependsOnSpecs?: string[];
  modules: Record<string, string>;
  interfaces: Record<string, string>;
  dataFlow: string[];
  errorHandling: Record<string, string>;
  constraints: string[];
}

/** 로드된 Contract 노드 */
export interface ContractNode {
  /** 절대 경로 */
  path: string;
  /** 도메인명 (상위 디렉토리명, 루트면 빈 문자열) */
  domain: string;
  /** 파일명 (확장자 제외) */
  basename: string;
  document: ContractDocument;
}

/** 로드된 Spec 노드 */
export interface SpecNode {
  /** 절대 경로 */
  path: string;
  /** 도메인명 */
  domain: string;
  /** 파일명 (확장자 제외) */
  basename: string;
  document: SpecDocument;
  /** contracts 필드에서 해소된 절대 경로 목록 */
  resolvedContracts: string[];
  /** dependsOnSpecs 필드에서 해소된 절대 경로 목록 */
  resolvedDependsOnSpecs: string[];
}

/** 로드된 CDD 프로젝트 */
export interface CddProject {
  /** contract 디렉토리의 절대 경로 */
  contractDir: string;
  /** 프로젝트 루트의 절대 경로 (contractDir의 부모) */
  projectRoot: string;
  contracts: ContractNode[];
  specs: SpecNode[];
}

/** 검증 이슈 심각도 */
export type IssueSeverity = "error" | "warning";

/** 검증 이슈 */
export interface ValidationIssue {
  severity: IssueSeverity;
  /** 관련 파일 절대 경로 */
  path: string;
  message: string;
}

/** Contract 필수 필드 목록 */
export const CONTRACT_REQUIRED_FIELDS = [
  "schema",
  "lastModified",
  "features",
  "overview",
  "domainGlossary",
  "userRoles",
  "businessRules",
  "edgeCases",
] as const;

/** Spec 필수 필드 목록 */
export const SPEC_REQUIRED_FIELDS = [
  "schemaVersion",
  "summary",
  "description",
  "acceptanceCriteria",
  "lastModified",
  "status",
  "sources",
  "contracts",
  "modules",
  "interfaces",
  "dataFlow",
  "errorHandling",
  "constraints",
] as const;
