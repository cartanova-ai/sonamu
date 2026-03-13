import AlertCircleIcon from "~icons/lucide/alert-circle";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import BoxIcon from "~icons/lucide/box";
import Code2Icon from "~icons/lucide/code-2";
import FileTextIcon from "~icons/lucide/file-text";
import GitBranchIcon from "~icons/lucide/git-branch";
import GlobeIcon from "~icons/lucide/globe";
import ListIcon from "~icons/lucide/list";
import TerminalIcon from "~icons/lucide/terminal";
import type {
  CddRendererType,
  CddSchema,
  CddSchemaField,
  CddSchemaFieldType,
  SectionDescriptor,
} from "../types";
import { humanize, isPlainObject } from "../utils/schema";
import { ObjectRecordRenderer } from "./object_record_renderer";
import { StringBlockRenderer } from "./string_block_renderer";
import { StringListRenderer } from "./string_list_renderer";
import { StringRecordRenderer } from "./string_record_renderer";
import type { FieldRendererDefinition } from "./types";

export const FIELD_RENDERERS: Record<CddRendererType, FieldRendererDefinition> = {
  markdown: {
    Component: StringBlockRenderer,
    isEmpty: (v) => typeof v !== "string" || v.trim() === "",
    supportedTypes: ["string"],
  },
  "bullet-list": {
    Component: StringListRenderer,
    isEmpty: (v) => !Array.isArray(v) || v.length === 0,
    supportedTypes: ["string[]"],
  },
  "label-grid": {
    Component: StringRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
    supportedTypes: ["Record<string, string>"],
  },
  "grouped-record": {
    Component: ObjectRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
    supportedTypes: ["Record<string, object>"],
  },
  table: {
    Component: ObjectRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
    supportedTypes: ["Record<string, string>", "Record<string, object>"],
  },
};

/** type별 기본 renderer 매핑 (renderer 미지정 시 사용) */
export const DEFAULT_RENDERER: Record<CddSchemaFieldType, CddRendererType> = {
  string: "markdown",
  "string[]": "bullet-list",
  "Record<string, string>": "label-grid",
  "Record<string, object>": "grouped-record",
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
    const rendererKey = field.renderer ?? DEFAULT_RENDERER[field.type];
    const rendererDef = FIELD_RENDERERS[rendererKey];

    if (!rendererDef.supportedTypes.includes(field.type)) {
      throw new Error(
        `renderer "${rendererKey}"은(는) type "${field.type}"을(를) 지원하지 않습니다 (field: ${field.name})`,
      );
    }

    const value = document[field.name];
    if (rendererDef.isEmpty(value)) continue;

    const { Component } = rendererDef;
    sections.push({
      id: `${prefix}-${field.name}`,
      title: getFieldLabel(field),
      icon: getFieldIcon(field.name),
      render: () => <Component field={field} value={value} />,
    });
  }

  return sections;
}
