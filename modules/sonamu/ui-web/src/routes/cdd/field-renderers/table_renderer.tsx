import { humanize, isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function TableRenderer({ value }: FieldRendererProps) {
  if (!isPlainObject(value)) return null;

  const firstVal = Object.values(value)[0];
  if (isPlainObject(firstVal)) {
    return <ObjectTableRenderer value={value} />;
  }
  return <StringTableRenderer value={value} />;
}

function StringTableRenderer({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, v]) => typeof v === "string");
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2.5 font-bold text-[11px] text-slate-500 uppercase tracking-wide">
              Key
            </th>
            <th className="px-4 py-2.5 font-bold text-[11px] text-slate-500 uppercase tracking-wide">
              Value
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([k, v]) => (
            <tr key={k} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-slate-800 whitespace-nowrap">
                {k}
              </td>
              <td className="px-4 py-2.5 text-[13px] text-slate-600 leading-relaxed">
                {String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObjectTableRenderer({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value).filter(([, v]) => isPlainObject(v));
  if (entries.length === 0) return null;

  const allProps = new Set<string>();
  for (const [, obj] of entries) {
    for (const prop of Object.keys(obj as Record<string, unknown>)) {
      allProps.add(prop);
    }
  }
  const columns = [...allProps];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-2.5 font-bold text-[11px] text-slate-500 uppercase tracking-wide whitespace-nowrap">
              Name
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-4 py-2.5 font-bold text-[11px] text-slate-500 uppercase tracking-wide whitespace-nowrap"
              >
                {humanize(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, obj]) => {
            const record = obj as Record<string, unknown>;
            return (
              <tr key={key} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2.5 font-mono text-[12px] font-semibold text-slate-800 whitespace-nowrap">
                  {key}
                </td>
                {columns.map((col) => {
                  const val = record[col];
                  return (
                    <td
                      key={col}
                      className="px-4 py-2.5 text-[13px] text-slate-600 leading-relaxed"
                    >
                      {Array.isArray(val) ? val.join(", ") : String(val ?? "")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
