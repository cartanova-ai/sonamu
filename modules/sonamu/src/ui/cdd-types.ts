export type CddFileType = "contract" | "spec";

export type CddSchemaFieldType =
  | "string"
  | "string[]"
  | "Record<string, string>"
  | "Record<string, object>";

export type CddSchemaField = {
  name: string;
  label?: string;
  type: CddSchemaFieldType;
  renderer?: string;
  required: boolean;
};

export type CddSchema = {
  id: string;
  type: "contract" | "spec";
  fields: CddSchemaField[];
};

export type CddContentEnvelope = {
  document: Record<string, unknown>;
  schema: CddSchema | null;
  fileType: CddFileType;
};

export type CddTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  fileType?: CddFileType;
  children?: CddTreeNode[];
};

export type CddSchemaSummary = {
  key: string;
  id: string;
  path: string;
  type: "contract" | "spec";
  fieldCount: number;
  referenceCount: number;
  hasIdMismatch: boolean;
  parseError?: string;
};

export type CddSchemaReference = {
  path: string;
  fileType: CddFileType;
  name: string;
};

export type CddSchemaDetailEnvelope = {
  key: string;
  path: string;
  schema: CddSchema;
  references: CddSchemaReference[];
  hasIdMismatch: boolean;
};

/** Spec 문서 상태 */
export type CddSpecStatus = "draft" | "specifying" | "implementing" | "validating" | "done";

/** 대시보드 문서 요약 */
export type CddDocumentSummary = {
  path: string;
  name: string;
  fileType: CddFileType;
  status?: CddSpecStatus;
  schemaId?: string;
  featureCount?: number;
  acceptanceCriteriaCount?: number;
  sourceCount?: number;
  lastModified?: string;
  parseError?: string;
};

/** 대시보드 통계 */
export type CddDashboardData = {
  exists: boolean;
  stats: {
    totalContracts: number;
    totalSpecs: number;
    statusDistribution: Record<CddSpecStatus, number>;
  };
  documents: CddDocumentSummary[];
};

/** Acceptance Criterion 테스트 참조 */
export type AcceptanceCriterionTestRef = {
  target: string;
  pattern: string;
};

/** 구조화된 Acceptance Criterion */
export type AcceptanceCriterion = {
  id: string;
  condition: string;
  testRef: AcceptanceCriterionTestRef;
};
