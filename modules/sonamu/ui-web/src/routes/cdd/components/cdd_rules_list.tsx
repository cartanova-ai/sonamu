import classNames from "classnames";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import ScaleIcon from "~icons/lucide/scale";
import type { CddRuleSummary } from "../types";

export function CddRulesList({
  rules,
  activeRuleKey,
  onSelect,
}: {
  rules: CddRuleSummary[];
  activeRuleKey: string | null;
  onSelect: (key: string) => void;
}) {
  if (rules.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        <ScaleIcon className="w-8 h-8 mx-auto text-gray-200 mb-2" />
        <p>No rules found</p>
        <p className="text-[10px] text-gray-300 mt-1">
          Add <code className="bg-gray-100 px-1 rounded">*.rules.json</code> files to{" "}
          <code className="bg-gray-100 px-1 rounded">contract/rules/</code>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {rules.map((rule) => {
        const isActive = activeRuleKey === rule.key;

        return (
          <button
            type="button"
            key={rule.key}
            className={classNames(
              "w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer",
              isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50",
            )}
            onClick={() => onSelect(rule.key)}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <ScaleIcon
                className={classNames(
                  "w-3.5 h-3.5 shrink-0",
                  isActive ? "text-blue-500" : "text-gray-400",
                )}
              />
              <span className="text-xs font-semibold truncate flex-1">{rule.key}</span>
            </div>
            <div className="pl-5.5 text-[10px] text-gray-400 truncate">{rule.description}</div>
            <div className="pl-5.5 flex items-center gap-3 text-[10px] text-gray-400 mt-0.5">
              <span>{rule.ruleCount} rules</span>
              {rule.parseError && <AlertTriangleIcon className="w-3 h-3 text-red-500" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
