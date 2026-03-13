import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function CardGridRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => isPlainObject(v))
    : [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {entries.map(([key, obj]) => {
        const record = obj as Record<string, unknown>;
        return (
          <div
            key={key}
            className="rounded-lg border border-slate-200 p-4 hover:border-blue-200 hover:shadow-sm transition-all"
          >
            <h4 className="font-mono text-[12px] font-bold text-slate-900 uppercase tracking-wide mb-3 pb-2 border-b border-slate-100">
              {key}
            </h4>
            <div className="space-y-2">
              {Object.entries(record).map(([prop, val]) => (
                <div key={prop} className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                    {humanize(prop)}
                  </span>
                  <span className="text-[13px] text-slate-700 leading-relaxed">
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
