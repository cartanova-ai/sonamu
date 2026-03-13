import type { FieldRendererProps } from "./types";

export function CodeBlockRenderer({ value }: FieldRendererProps) {
  if (typeof value !== "string") return null;
  return (
    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto">
      <code className="text-[13px] leading-relaxed text-slate-800 font-mono whitespace-pre-wrap">
        {value}
      </code>
    </pre>
  );
}
