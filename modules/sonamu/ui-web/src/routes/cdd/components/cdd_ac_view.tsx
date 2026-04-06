import classNames from "classnames";
import { useMemo, useState } from "react";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import FileCodeIcon from "~icons/lucide/file-code";
import ListChecksIcon from "~icons/lucide/list-checks";
import SearchIcon from "~icons/lucide/search";

import { CddService } from "../service";
import type { CddAcFile } from "../types";

export function CddAcView() {
  const { data, isLoading, error } = CddService.useCddAc();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFiles = useMemo(() => {
    const files = data?.files ?? [];
    if (!searchQuery.trim()) return files;
    const q = searchQuery.toLowerCase();
    return files
      .map((f) => {
        const matchesPath = f.path.toLowerCase().includes(q);
        const matchedEntries = f.entries.filter(
          (e) => e.test.toLowerCase().includes(q) || e.describe?.toLowerCase().includes(q),
        );
        if (matchesPath) return f;
        if (matchedEntries.length > 0) return { ...f, entries: matchedEntries };
        return null;
      })
      .filter((f): f is CddAcFile => f !== null);
  }, [data?.files, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading AC...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
        Failed to load AC
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      <nav className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 shrink-0">
        <div className="max-w-4xl mx-auto h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white shrink-0">
              <ListChecksIcon className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold leading-none">Acceptance Criteria</div>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {data?.total ?? 0} AC in {data?.files.length ?? 0} files
              </p>
            </div>
          </div>
          <div className="relative w-56">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder="Search AC..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg text-xs transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-3">
          {filteredFiles.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ListChecksIcon className="w-12 h-12 mx-auto text-gray-200 mb-3" />
              <p className="text-sm">
                {searchQuery ? "No matching AC found" : "No AC found in test files"}
              </p>
            </div>
          )}
          {filteredFiles.map((file) => (
            <AcFileCard key={file.path} file={file} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AcFileCard({ file }: { file: CddAcFile }) {
  const [expanded, setExpanded] = useState(true);

  const grouped = useMemo(() => {
    const map = new Map<string | null, string[]>();
    for (const e of file.entries) {
      const list = map.get(e.describe);
      if (list) {
        list.push(e.test);
      } else {
        map.set(e.describe, [e.test]);
      }
    }
    return map;
  }, [file.entries]);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors cursor-pointer text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDownIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
        <FileCodeIcon className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-700 truncate flex-1">{file.path}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{file.entries.length} AC</span>
      </button>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {Array.from(grouped.entries()).map(([describe, tests]) => (
            <div key={describe ?? "__root__"}>
              {describe && (
                <div className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {describe}
                </div>
              )}
              <div className={classNames("space-y-1", describe && "pl-3")}>
                {tests.map((test, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed"
                  >
                    <span className="text-slate-300 mt-0.5 shrink-0">-</span>
                    <span>{test}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
