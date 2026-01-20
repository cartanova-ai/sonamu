import { useState } from "react";
import BugIcon from "~icons/lucide/bug";
import CloseIcon from "~icons/lucide/x";

interface Section {
  title: string;
  fields: string[];
}

interface FormDebugPanelProps {
  formData: Record<string, unknown>;
  title?: string;
  sections?: Section[];
}

export function FormDebugPanel({ formData, title = "Form State", sections }: FormDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  // 필드 값을 포맷팅
  const formatValue = (value: unknown): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "boolean") return value.toString();
    if (typeof value === "number") return value.toString();
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      // 배열 요소를 문자열로 변환하여 표시
      const items = value.map((item) => {
        if (typeof item === "string") return item;
        if (typeof item === "number" || typeof item === "boolean") return String(item);
        if (item && typeof item === "object" && "label" in item) return String(item.label);
        if (item && typeof item === "object") return JSON.stringify(item);
        return String(item);
      });
      return `[${items.join(", ")}]`;
    }
    if (value instanceof File) return `File: ${value.name}`;
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  // sections가 제공되지 않으면 formData의 모든 키를 하나의 섹션으로 표시
  const displaySections: Section[] = sections || [
    { title: "Form Data", fields: Object.keys(formData) },
  ];

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Show Debug"
        className="fixed bottom-4 right-4 bg-gray-900 text-white p-3 rounded-lg shadow-lg hover:bg-gray-800 transition-colors z-9999 cursor-pointer"
      >
        <BugIcon className="w-5 h-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-gray-900 text-green-400 rounded-lg shadow-2xl overflow-hidden font-mono text-xs z-9999">
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2 border-b border-gray-700">
        <span className="text-white font-semibold">{title}</span>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 overflow-auto max-h-80 space-y-3">
        {displaySections.map((section) => {
          // 섹션의 필드들 중에서 formData에 있는 것만 필터링
          const sectionData = section.fields
            .filter((field) => field in formData)
            .map((field) => ({ field, value: formData[field] }));

          // 섹션에 데이터가 없으면 표시하지 않음
          if (sectionData.length === 0) return null;

          return (
            <div key={section.title} className="border-b border-gray-700 pb-3 last:border-b-0">
              <div className="text-yellow-400 font-semibold mb-2">{section.title}</div>
              <div className="space-y-1 pl-2">
                {sectionData.map(({ field, value }) => (
                  <div key={field} className="flex gap-2">
                    <span className="text-cyan-400">{field}:</span>
                    <span className="text-green-400 flex-1 break-all">{formatValue(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
