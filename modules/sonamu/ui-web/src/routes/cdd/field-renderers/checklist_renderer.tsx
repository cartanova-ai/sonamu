import CheckCircle2Icon from "~icons/lucide/check-circle-2";

import { type FieldRendererProps } from "./types";

export function ChecklistRenderer({ value }: FieldRendererProps) {
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return (
    <ul className="space-y-2 list-none p-0 m-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 items-start group">
          <CheckCircle2Icon className="w-4 h-4 mt-0.5 text-slate-300 group-hover:text-emerald-500 transition-colors shrink-0" />
          <span className="text-[14px] text-slate-700 leading-relaxed group-hover:text-slate-900 transition-colors">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}
