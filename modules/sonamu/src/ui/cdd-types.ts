export type CddFileType = "contract" | "rules";

export type CddTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  fileType?: CddFileType;
  children?: CddTreeNode[];
};

/** readContent 응답 */
export type CddContentResult = {
  content: string;
  fileType: CddFileType;
};

/** Rules 개별 규칙 */
export type CddRuleEntry = {
  id: string;
  when: string;
  instruction: string;
  examples?: string[];
};

/** Rules 파일 요약 */
export type CddRuleSummary = {
  key: string;
  path: string;
  description: string;
  ruleCount: number;
  parseError?: string;
};

/** Rules 파일 상세 */
export type CddRuleDetail = {
  key: string;
  path: string;
  description: string;
  rules: CddRuleEntry[];
};

/** Rule 추가 요청 */
export type CddAddRuleRequest = {
  ruleKey: string;
  when: string;
  instruction: string;
  examples?: string[];
};

/** AC 엔트리 */
export type CddAcEntry = {
  describe: string | null;
  test: string;
};

/** AC 파일 결과 */
export type CddAcFile = {
  path: string;
  entries: CddAcEntry[];
};

/** AC 목록 응답 */
export type CddAcListResult = {
  files: CddAcFile[];
  total: number;
};
