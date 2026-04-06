import Markdown from "react-markdown";

import type { FieldRendererProps } from "./types";

export function StringBlockRenderer({ value }: FieldRendererProps) {
  if (typeof value !== "string") return null;
  return (
    <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-900 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none">
      <Markdown>{value}</Markdown>
    </div>
  );
}
