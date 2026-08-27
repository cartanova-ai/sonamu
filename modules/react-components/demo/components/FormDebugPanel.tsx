import { useState } from "react";
import { z } from "zod";
import BugIcon from "~icons/lucide/bug";
import CloseIcon from "~icons/lucide/x";

interface Section {
  title: string;
  fields: string[];
}

interface FormDebugPanelProps {
  formData: object;
  title?: string;
  sections?: Section[];
}

type DebugValue = z.input<ReturnType<typeof z.any>>;

const stringValue = z.string();
const numberValue = z.number();
const booleanValue = z.boolean();

export function FormDebugPanel({ formData, title = "Form State", sections }: FormDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(true);

  // 필드 값을 포맷팅
  const formatValue = (value: DebugValue): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (stringValue.safeParse(value).success) return `"${String(value)}"`;
    if (booleanValue.safeParse(value).success || numberValue.safeParse(value).success) {
      return String(value);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return "[]";
      // 배열 요소를 문자열로 변환하여 표시
      const items = value.map((item) => {
        if (stringValue.safeParse(item).success) return String(item);
        if (numberValue.safeParse(item).success || booleanValue.safeParse(item).success) {
          return String(item);
        }
        if (item !== null && z.object({ label: z.unknown() }).safeParse(item).success) {
          return JSON.stringify(item);
        }
        if (item !== null) return JSON.stringify(item);
        return String(item);
      });
      return `[${items.join(", ")}]`;
    }
    if (value instanceof File) return `File: ${value.name}`;
    if (value !== undefined) return JSON.stringify(value, null, 2);
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
          const requestedFields = new Set(section.fields);
          const sectionData = Object.entries(formData)
            .filter(([field]) => requestedFields.has(field))
            .map(([field, value]) => ({ field, value }));

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
