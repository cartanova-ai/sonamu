import type { CddSchemaField } from "../types";

export type FieldRendererProps = {
  field: CddSchemaField;
  value: unknown;
};

export type FieldRendererDefinition = {
  Component: React.ComponentType<FieldRendererProps>;
  isEmpty: (value: unknown) => boolean;
};
