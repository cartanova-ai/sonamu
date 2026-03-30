/** Rules 파일의 개별 규칙 */
export interface RuleEntry {
  id: string;
  when: string;
  instruction: string;
  examples?: string[];
}

/** Rules JSON 문서 구조 */
export interface RulesDocument {
  description: string;
  rules: RuleEntry[];
}

/** 로드된 Rules 노드 */
export interface RulesNode {
  /** 절대 경로 */
  path: string;
  /** 파일명 (확장자 제외, e.g. "web") */
  basename: string;
  document: RulesDocument;
}

/** 로드된 CDD 프로젝트 */
export interface CddProject {
  /** contract 디렉토리의 절대 경로 */
  contractDir: string;
  /** 프로젝트 루트의 절대 경로 (contractDir의 부모) */
  projectRoot: string;
  rules: RulesNode[];
}
