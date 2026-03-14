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
