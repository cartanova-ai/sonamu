import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function StringRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => typeof v === "string")
    : [];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex flex-col border-l-2 border-slate-100 pl-4 py-1 hover:border-blue-200 transition-colors"
        >
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1">
            {humanize(k)}
          </span>
          <span className="text-[14px] text-slate-700 font-medium">{String(v)}</span>
        </div>
      ))}
    </div>
  );
}
