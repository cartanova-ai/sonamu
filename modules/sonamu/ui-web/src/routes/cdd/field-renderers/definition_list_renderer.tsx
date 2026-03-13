import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function DefinitionListRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => typeof v === "string")
    : [];
  return (
    <dl className="space-y-4">
      {entries.map(([k, v]) => (
        <div key={k} className="group">
          <dt className="text-[12px] font-bold text-slate-500 uppercase tracking-wide mb-1 group-hover:text-slate-700 transition-colors">
            {humanize(k)}
          </dt>
          <dd className="text-[14px] text-slate-800 leading-relaxed ml-0">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
