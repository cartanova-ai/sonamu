import classNames from "classnames";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import type { CddSchemaSummary } from "../types";

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  contract: { label: "Contract", className: "bg-blue-50 text-blue-600 border-blue-200" },
  spec: { label: "Spec", className: "bg-violet-50 text-violet-600 border-violet-200" },
};

export function CddSchemaList({
  schemas,
  activeSchemaKey,
  onSelect,
}: {
  schemas: CddSchemaSummary[];
  activeSchemaKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (schemas.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">No schemas found</div>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {schemas.map((schema) => {
        const badge = TYPE_BADGE[schema.type] ?? TYPE_BADGE.contract;
        const isActive = activeSchemaKey === schema.key;

        return (
          <button
            type="button"
            key={schema.key}
            className={classNames(
              "w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer",
              isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50",
            )}
            onClick={() => onSelect(schema.key)}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold truncate flex-1">{schema.id}</span>
              <span
                className={classNames(
                  "text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider shrink-0",
                  badge.className,
                )}
              >
                {badge.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-gray-400">
              <span>{schema.fieldCount} fields</span>
              <span>{schema.referenceCount} refs</span>
              {schema.hasIdMismatch && <AlertTriangleIcon className="w-3 h-3 text-amber-500" />}
              {schema.parseError && <AlertTriangleIcon className="w-3 h-3 text-red-500" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
