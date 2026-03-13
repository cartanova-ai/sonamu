import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function ObjectRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => isPlainObject(v))
    : [];
  return (
    <div className="space-y-6">
      {entries.map(([key, obj]) => {
        const record = obj as Record<string, unknown>;
        return (
          <div key={key} className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="font-mono text-[11px] font-bold text-slate-400 bg-white px-2 uppercase tracking-widest">
                {key}
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid grid-cols-1 gap-4">
              {Object.entries(record).map(([prop, val]) => (
                <div key={prop} className="flex gap-4 items-baseline">
                  <span className="text-[13px] text-slate-500 font-medium min-w-[140px] shrink-0 text-right">
                    {humanize(prop)}
                  </span>
                  <span className="text-[14px] text-slate-800 leading-relaxed">
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
