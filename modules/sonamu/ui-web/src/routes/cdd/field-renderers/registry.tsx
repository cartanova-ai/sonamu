import AlertCircleIcon from "~icons/lucide/alert-circle";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import BoxIcon from "~icons/lucide/box";
import Code2Icon from "~icons/lucide/code-2";
import FileTextIcon from "~icons/lucide/file-text";
import GitBranchIcon from "~icons/lucide/git-branch";
import GlobeIcon from "~icons/lucide/globe";
import ListIcon from "~icons/lucide/list";
import TerminalIcon from "~icons/lucide/terminal";
import type { CddSchema, CddSchemaField, CddSchemaFieldType, SectionDescriptor } from "../types";
import { humanize, isPlainObject } from "../utils/schema";
import { ObjectRecordRenderer } from "./object_record_renderer";
import { StringBlockRenderer } from "./string_block_renderer";
import { StringListRenderer } from "./string_list_renderer";
import { StringRecordRenderer } from "./string_record_renderer";
import type { FieldRendererDefinition } from "./types";

export const FIELD_RENDERERS: Record<CddSchemaFieldType, FieldRendererDefinition> = {
  string: {
    Component: StringBlockRenderer,
    isEmpty: (v) => typeof v !== "string" || v.trim() === "",
  },
  "string[]": {
    Component: StringListRenderer,
    isEmpty: (v) => !Array.isArray(v) || v.length === 0,
  },
  "Record<string, string>": {
    Component: StringRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
  },
  "Record<string, object>": {
    Component: ObjectRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
  },
};

export const getFieldLabel = (field: CddSchemaField) => field.label ?? humanize(field.name);

const FIELD_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: FileTextIcon,
  domainGlossary: BoxIcon,
  userRoles: GlobeIcon,
  businessRules: AlertTriangleIcon,
  edgeCases: AlertCircleIcon,
  modules: BoxIcon,
  interfaces: Code2Icon,
  dataFlow: GitBranchIcon,
  errorHandling: AlertTriangleIcon,
  constraints: TerminalIcon,
  api: GlobeIcon,
  types: Code2Icon,
};

export function getFieldIcon(fieldName: string): React.ComponentType<{ className?: string }> {
  return FIELD_ICON_MAP[fieldName] ?? ListIcon;
}

export function buildCustomFieldSections(
  schema: CddSchema | null,
  document: Record<string, unknown>,
  prefix: string,
): SectionDescriptor[] {
  if (!schema) return [];
  const sections: SectionDescriptor[] = [];

  for (const field of schema.fields) {
    const renderer = FIELD_RENDERERS[field.type];
    const value = document[field.name];
    if (!renderer || renderer.isEmpty(value)) continue;

    const { Component } = renderer;
    sections.push({
      id: `${prefix}-${field.name}`,
      title: getFieldLabel(field),
      icon: getFieldIcon(field.name),
      render: () => <Component field={field} value={value} />,
    });
  }

  return sections;
}
