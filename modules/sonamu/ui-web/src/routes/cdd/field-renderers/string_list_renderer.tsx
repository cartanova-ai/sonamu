import type { FieldRendererProps } from "./types";

export function StringListRenderer({ value }: FieldRendererProps) {
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50/50">
          <span className="text-slate-700 text-sm leading-relaxed">{item}</span>
        </div>
      ))}
    </div>
  );
}
