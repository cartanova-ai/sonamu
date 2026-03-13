import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function ObjectRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => isPlainObject(v))
    : [];
  return (
    <div className="space-y-4">
      {entries.map(([key, obj]) => {
        const record = obj as Record<string, unknown>;
        return (
          <div key={key} className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <span className="font-mono text-sm font-semibold text-slate-800">{key}</span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {Object.entries(record).map(([prop, val]) => (
                <div key={prop} className="flex gap-3 text-sm">
                  <span className="text-slate-400 font-medium min-w-[100px] shrink-0">
                    {humanize(prop)}
                  </span>
                  <span className="text-slate-700">
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
