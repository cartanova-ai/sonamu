export type {
  AcceptanceCriterion,
  CddContentEnvelope,
  CddDashboardData,
  CddDocumentSummary,
  CddFileType,
  CddSchema,
  CddSchemaDetailEnvelope,
  CddSchemaField,
  CddSchemaFieldType,
  CddSchemaReference,
  CddSchemaSummary,
  CddSpecStatus,
  CddTreeNode,
} from "sonamu/cdd-types";

export type { CddRendererType } from "./field-renderers/registry";

export type CddMode = "dashboard" | "documents" | "schemas";

export type SectionDescriptor = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
};
