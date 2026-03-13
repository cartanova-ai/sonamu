import type { FieldRendererProps } from "./types";

export function PlainTextRenderer({ value }: FieldRendererProps) {
  if (typeof value !== "string") return null;
  return <p className="text-[14px] text-slate-700 leading-relaxed whitespace-pre-wrap">{value}</p>;
}
