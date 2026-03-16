import classNames from "classnames";
import { useMemo, useState } from "react";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import FileTextIcon from "~icons/lucide/file-text";
import LayersIcon from "~icons/lucide/layers";
import Link2Icon from "~icons/lucide/link-2";
import PencilIcon from "~icons/lucide/pencil";
import { defaultCatch } from "../../../services/sonamu.shared";
import {
  DEFAULT_RENDERER,
  getCompatibleRenderers,
  getFieldLabel,
} from "../field-renderers/registry";
import { CddService } from "../service";
import type {
  CddRendererType,
  CddSchemaField,
  CddSchemaFieldType,
  SectionDescriptor,
} from "../types";
import { CddRendererPreview } from "./cdd_renderer_preview";
import { CddSectionLayout, ViewerSection } from "./cdd_section_layout";

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  contract: { label: "Contract", className: "bg-blue-50 text-blue-600 border-blue-200" },
  spec: { label: "Spec", className: "bg-violet-50 text-violet-600 border-violet-200" },
};

const FIELD_TYPE_COLOR: Record<CddSchemaFieldType, string> = {
  string: "bg-emerald-50 text-emerald-600 border-emerald-200",
  "string[]": "bg-sky-50 text-sky-600 border-sky-200",
  "Record<string, string>": "bg-amber-50 text-amber-600 border-amber-200",
  "Record<string, object>": "bg-rose-50 text-rose-600 border-rose-200",
};

function FieldRow({ field }: { field: CddSchemaField }) {
  const [previewRenderer, setPreviewRenderer] = useState<CddRendererType | null>(null);
  const compatibleRenderers = useMemo(() => getCompatibleRenderers(field.type), [field.type]);
  const currentRenderer = field.renderer ?? DEFAULT_RENDERER[field.type];
  const typeColor = FIELD_TYPE_COLOR[field.type] ?? "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-slate-800">{getFieldLabel(field)}</span>
        <code className="text-[10px] font-mono text-slate-400">{field.name}</code>
        <span
          className={classNames(
            "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider",
            typeColor,
          )}
        >
          {field.type}
        </span>
        {field.required && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-red-50 text-red-500 border-red-200 uppercase tracking-wider">
            Required
          </span>
        )}
        <div className="ml-auto relative">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">Renderer:</span>
            <div className="relative">
              <select
                className="appearance-none text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded px-2 py-1 pr-6 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                value={previewRenderer ?? currentRenderer}
                onChange={(e) => {
                  const val = e.target.value as CddRendererType;
                  setPreviewRenderer(val === currentRenderer ? null : val);
                }}
              >
                {compatibleRenderers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {r === currentRenderer ? " (current)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDownIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
      {previewRenderer && (
        <div className="border-t border-slate-200 p-4 bg-slate-50/50">
          <CddRendererPreview rendererType={previewRenderer} fieldType={field.type} />
        </div>
      )}
    </div>
  );
}

export function CddSchemaDetail({
  schemaKey,
  onSwitchToDocument,
}: {
  schemaKey: string;
  onSwitchToDocument: (path: string) => void;
}) {
  const { data, isLoading, refetch } = CddService.useReadCddSchema(schemaKey);
  const [editing, setEditing] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  const envelope = data ?? null;
  const schema = envelope?.schema ?? null;
  const references = envelope?.references ?? [];
  const hasIdMismatch = envelope?.hasIdMismatch ?? false;

  const handleEdit = () => {
    setEditing(true);
    CddService.editCddSchema(schemaKey)
      .then(() => refetch())
      .catch(defaultCatch)
      .finally(() => setEditing(false));
  };

  const sections = useMemo((): SectionDescriptor[] => {
    const result: SectionDescriptor[] = [];

    if (schema) {
      result.push({
        id: "schema-fields",
        title: "Fields",
        icon: LayersIcon,
        render: () => (
          <div className="space-y-3">
            {schema.fields.map((field) => (
              <FieldRow key={field.name} field={field} />
            ))}
            {schema.fields.length === 0 && (
              <p className="text-sm text-slate-400">No fields defined</p>
            )}
          </div>
        ),
      });
    }

    if (references.length > 0) {
      result.push({
        id: "schema-references",
        title: "References",
        icon: Link2Icon,
        render: () => (
          <div className="space-y-1.5">
            {references.map((ref) => (
              <button
                type="button"
                key={ref.path}
                className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 cursor-pointer transition-colors group text-left w-full"
                onClick={() => onSwitchToDocument(ref.path)}
              >
                <FileTextIcon className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-blue-400" />
                <span className="truncate flex-1">{ref.name}</span>
                <span
                  className={classNames(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0",
                    ref.fileType === "contract"
                      ? "bg-blue-50 text-blue-600 border-blue-200"
                      : "bg-violet-50 text-violet-600 border-violet-200",
                  )}
                >
                  {ref.fileType}
                </span>
              </button>
            ))}
          </div>
        ),
      });
    }

    return result;
  }, [schema, references, onSwitchToDocument]);

  if (isLoading || !schema) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-sm">{isLoading ? "Loading..." : "Schema not found"}</div>
      </div>
    );
  }

  const badge = TYPE_BADGE[schema.type] ?? TYPE_BADGE.contract;

  const navContent = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white shrink-0">
          <LayersIcon className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold leading-none truncate">{schema.id}</h1>
            <span
              className={classNames(
                "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
            {schema.fields.length} fields · {references.length} references
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {hasIdMismatch && (
          <div className="flex items-center gap-1.5 mr-2 text-amber-600">
            <AlertTriangleIcon className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">ID Mismatch</span>
          </div>
        )}
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleEdit}
          disabled={editing}
        >
          <PencilIcon className="w-3 h-3" />
          {editing ? "Opening..." : "Edit Schema"}
        </button>
      </div>
    </>
  );

  return (
    <CddSectionLayout
      navChildren={navContent}
      tocSections={sections}
      activeSection={activeSection || sections[0]?.id || ""}
      onSectionClick={setActiveSection}
    >
      {hasIdMismatch && (
        <div className="mb-8 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4 shrink-0" />
          <span>
            Schema filename does not match the declared ID. The file should be renamed to match{" "}
            <code className="font-mono text-xs bg-amber-100 px-1 rounded">{schema.id}</code>.
          </span>
        </div>
      )}
      {sections.map((s) => (
        <ViewerSection key={s.id} id={s.id} title={s.title} Icon={s.icon}>
          {s.render()}
        </ViewerSection>
      ))}
    </CddSectionLayout>
  );
}
