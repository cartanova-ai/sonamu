import { isPlainObject } from "../utils/schema";
import type { FieldRendererProps } from "./types";

export function StringRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => typeof v === "string")
    : [];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 font-bold text-slate-700">Key</th>
            <th className="px-4 py-3 font-bold text-slate-700">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([k, v]) => (
            <tr key={k} className="hover:bg-slate-50/50">
              <td className="px-4 py-3 font-mono text-sm font-medium text-slate-800 whitespace-nowrap">
                {k}
              </td>
              <td className="px-4 py-3 text-slate-600">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
