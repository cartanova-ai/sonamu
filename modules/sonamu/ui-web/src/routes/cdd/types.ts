export type {
  CddContentEnvelope,
  CddFileType,
  CddSchema,
  CddSchemaDetailEnvelope,
  CddSchemaField,
  CddSchemaFieldType,
  CddSchemaReference,
  CddSchemaSummary,
  CddTreeNode,
} from "sonamu/cdd-types";

export type { CddRendererType } from "./field-renderers/registry";

export type CddMode = "documents" | "schemas";

export type SectionDescriptor = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
};
