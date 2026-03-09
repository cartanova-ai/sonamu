/** Spec 상태 */
export type SpecStatus = "draft" | "in-progress" | "done";

/** Spec revision 항목 */
export interface SpecRevision {
  id: string;
  date: string;
  features: string[];
  status: SpecStatus;
}

/** Contract JSON 문서 구조 */
export interface ContractDocument {
  lastModified: string;
  content: string[];
}

/** Spec JSON 문서 구조 */
export interface SpecDocument {
  lastModified: string;
  status: SpecStatus;
  sources: string[];
  contracts: string[];
  revisions: SpecRevision[];
  content: string[];
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

/** Contract content 필수 섹션 */
export const CONTRACT_REQUIRED_SECTIONS = [
  "Overview",
  "Domain Glossary",
  "Features/Capabilities",
  "User Roles/Actors",
  "Business Rules/Constraints",
  "Edge Cases",
] as const;

/** Spec content 필수 최상위 섹션 */
export const SPEC_REQUIRED_SECTIONS = ["Summary", "Features"] as const;

/** Spec feature 블록 필수 하위 섹션 */
export const SPEC_FEATURE_SUBSECTIONS = [
  "Modules/Components",
  "Interfaces",
  "Data Flow",
  "Error Handling",
  "Technical Constraints",
] as const;
