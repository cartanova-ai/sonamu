import { useState } from "react";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import ScaleIcon from "~icons/lucide/scale";
import { CddService } from "../service";
import type { CddRuleEntry } from "../types";

export function CddRuleDetail({ ruleKey }: { ruleKey: string }) {
  const { data, isLoading } = CddService.useReadCddRule(ruleKey);

  if (isLoading || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-sm">{isLoading ? "Loading..." : "Rule not found"}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 shrink-0">
        <div className="max-w-4xl mx-auto h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white shrink-0">
              <ScaleIcon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold leading-none truncate">{data.key}</div>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {data.description} · {data.rules.length} rules
              </p>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-3">
          {data.rules.map((rule) => (
            <RuleEntryCard key={rule.id} rule={rule} />
          ))}
          {data.rules.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No rules defined</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleEntryCard({ rule }: { rule: CddRuleEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasExamples = rule.examples && rule.examples.length > 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <code className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-semibold">
            {rule.id}
          </code>
          {hasExamples && (
            <span className="text-[10px] text-slate-400">{rule.examples?.length} examples</span>
          )}
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-400">When</span> {rule.when}
        </div>
        <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
          {rule.instruction}
        </div>
      </div>
      {hasExamples && (
        <>
          <button
            type="button"
            className="w-full px-4 py-1.5 border-t border-slate-100 bg-slate-50/50 flex items-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDownIcon className="w-3 h-3" />
            ) : (
              <ChevronRightIcon className="w-3 h-3" />
            )}
            Examples
          </button>
          {expanded && (
            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/30 space-y-2">
              {rule.examples?.map((ex, i) => (
                <div
                  key={i}
                  className="text-xs text-slate-600 leading-relaxed pl-3 border-l-2 border-slate-200"
                >
                  {ex}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
