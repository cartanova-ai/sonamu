import type { FieldRendererProps } from "./types";

export function TagListRenderer({ value }: FieldRendererProps) {
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span
          key={i}
          className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-[13px] font-medium hover:bg-slate-200 transition-colors"
        >
          {item}
        </span>
      ))}
    </div>
  );
}
