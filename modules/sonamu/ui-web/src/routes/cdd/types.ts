export type CddMode = "documents" | "schemas";

export type CddFileType = "contract" | "spec";

export type CddTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  fileType?: CddFileType;
  children?: CddTreeNode[];
};

export type CddSchemaFieldType =
  | "string"
  | "string[]"
  | "Record<string, string>"
  | "Record<string, object>";

export type CddRendererType =
  | "markdown"
  | "bullet-list"
  | "label-grid"
  | "grouped-record"
  | "table";

export type CddSchemaField = {
  name: string;
  label?: string;
  type: CddSchemaFieldType;
  renderer?: CddRendererType;
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

export type SectionDescriptor = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
};
