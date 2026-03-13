import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function ObjectRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => isPlainObject(v))
    : [];
  return (
    <div className="space-y-3">
      {entries.map(([key, obj]) => {
        const record = obj as Record<string, unknown>;
        return (
          <div key={key} className="rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100">
              <span className="font-mono text-xs font-bold text-slate-800">{key}</span>
            </div>
            <div className="px-3.5 py-3 space-y-1.5">
              {Object.entries(record).map(([prop, val]) => (
                <div key={prop} className="flex gap-3 text-xs">
                  <span className="text-slate-400 font-medium min-w-[120px] shrink-0">
                    {humanize(prop)}
                  </span>
                  <span className="text-slate-700 leading-relaxed">
                    {Array.isArray(val) ? val.join(", ") : String(val ?? "")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
