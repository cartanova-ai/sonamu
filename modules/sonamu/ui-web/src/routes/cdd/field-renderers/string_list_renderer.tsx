import type { FieldRendererProps } from "./types";

export function StringListRenderer({ value }: FieldRendererProps) {
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return (
    <ul className="space-y-2 list-none p-0 m-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-slate-700 text-[14px] leading-relaxed group">
          <span className="text-slate-300 mt-1 select-none flex-shrink-0">&bull;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
