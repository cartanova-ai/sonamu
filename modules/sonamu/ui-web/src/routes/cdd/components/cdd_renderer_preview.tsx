import { FIELD_RENDERERS } from "../field-renderers/registry";
import type { CddRendererType, CddSchemaFieldType } from "../types";

const SAMPLE_DATA: Record<CddSchemaFieldType, unknown> = {
  string: "This is a **sample** markdown text with `code` and formatting.",
  "string[]": ["First item example", "Second item example", "Third item example"],
  "Record<string, string>": {
    "Key One": "Value description one",
    "Key Two": "Value description two",
    "Key Three": "Value description three",
  },
  "Record<string, object>": {
    "Section A": { property: "value", status: "active", count: "3" },
    "Section B": { property: "other", status: "pending", count: "7" },
  },
};

export function CddRendererPreview({
  rendererType,
  fieldType,
}: {
  rendererType: CddRendererType;
  fieldType: CddSchemaFieldType;
}) {
  const rendererDef = FIELD_RENDERERS[rendererType];
  if (!rendererDef) return null;

  const { Component } = rendererDef;
  const sampleValue = SAMPLE_DATA[fieldType];
  const sampleField = { name: "sample", type: fieldType, required: false };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          {rendererType}
        </span>
      </div>
      <div className="p-3 text-sm">
        <Component field={sampleField} value={sampleValue} />
      </div>
    </div>
  );
}
