import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { useCallback, useMemo, useState } from "react";
import FileTextIcon from "~icons/lucide/file-text";
import FolderOpenIcon from "~icons/lucide/folder-open";
import ListChecksIcon from "~icons/lucide/list-checks";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import ScaleIcon from "~icons/lucide/scale";
import SearchIcon from "~icons/lucide/search";

import { CddAcView } from "./cdd/components/cdd_ac_view";
import { CddContractDetail } from "./cdd/components/cdd_contract_detail";
import { CddRuleDetail } from "./cdd/components/cdd_rule_detail";
import { CddRulesList } from "./cdd/components/cdd_rules_list";
import { CddTreeNodeItem } from "./cdd/components/cdd_tree_node_item";
import { CddService } from "./cdd/service";
import { type CddMode, type CddTreeNode } from "./cdd/types";
import { countFiles, filterTree, findTreeNode, sortTree } from "./cdd/utils/tree";

export const Route = createFileRoute("/cdd")({
  component: CddPage,
});

const MODE_TABS: { key: CddMode; label: string }[] = [
  { key: "rules", label: "Rules" },
  { key: "contracts", label: "Contracts" },
  { key: "ac", label: "AC" },
];

function CddPage() {
  const [mode, setMode] = useState<CddMode>("contracts");

  const {
    data: treeData,
    error: treeError,
    refetch: refetchTree,
  } = CddService.useCddTree(mode === "contracts");
  const { data: rulesData, refetch: refetchRules } = CddService.useCddRules(mode === "rules");
  const isTreeLoading = mode === "contracts" && !treeError && !treeData;

  const [searchQuery, setSearchQuery] = useState("");
  const [activeNodePath, setActiveNodePath] = useState<string | null>(null);
  const [activeRuleKey, setActiveRuleKey] = useState<string | null>(null);

  const sortedTree = useMemo(
    () => (treeData?.tree ? sortTree(treeData.tree, true) : []),
    [treeData],
  );
  const filteredTree = useMemo(
    () => filterTree(sortedTree, searchQuery),
    [sortedTree, searchQuery],
  );
  const fileCount = useMemo(() => (treeData?.tree ? countFiles(treeData.tree) : 0), [treeData]);

  const activeNode: CddTreeNode | null = useMemo(() => {
    if (!activeNodePath || !treeData?.tree) return null;
    return findTreeNode(treeData.tree, activeNodePath);
  }, [activeNodePath, treeData]);

  const filteredRules = useMemo(() => {
    const rules = rulesData?.rules ?? [];
    if (!searchQuery.trim()) return rules;
    const q = searchQuery.toLowerCase();
    return rules.filter(
      (r) => r.key.toLowerCase().includes(q) || r.description.toLowerCase().includes(q),
    );
  }, [rulesData, searchQuery]);

  const handleRefresh = useCallback(() => {
    refetchTree();
    refetchRules();
  }, [refetchTree, refetchRules]);

  const showSidebarContent = mode !== "ac";

  const renderMainContent = () => {
    if (mode === "ac") {
      return <CddAcView />;
    }

    if (mode === "rules") {
      if (activeRuleKey) {
        return <CddRuleDetail ruleKey={activeRuleKey} />;
      }
      return (
        <>
          <header className="h-14 border-b border-gray-100 flex items-center px-8 shrink-0">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>Rules</span>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="text-center text-gray-400 space-y-2">
              <ScaleIcon className="w-12 h-12 mx-auto text-gray-200" />
              <p className="text-sm">Select a rule to view its details</p>
            </div>
          </div>
        </>
      );
    }

    if (activeNode?.type === "file") {
      return <CddContractDetail node={activeNode} onRefetch={refetchTree} />;
    }

    return (
      <>
        <header className="h-14 border-b border-gray-100 flex items-center px-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Contracts</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-12">
          {activeNode?.type === "directory" ? (
            <div className="text-center text-gray-400 space-y-2">
              <FolderOpenIcon className="w-12 h-12 mx-auto text-yellow-300" />
              <p className="text-lg font-medium text-gray-700">{activeNode.name}</p>
              <p className="text-sm">{activeNode.children?.length ?? 0} items</p>
            </div>
          ) : (
            <div className="text-center text-gray-400 space-y-2">
              <FileTextIcon className="w-12 h-12 mx-auto text-gray-200" />
              <p className="text-sm">Select a document to view</p>
              <p className="text-xs text-gray-300">Browse contract files from the sidebar</p>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="flex h-[calc(100vh-var(--spacing-gnb))] bg-gray-50 text-gray-900">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm shrink-0">
        <div className="px-4 h-12 border-b border-gray-100 flex items-center justify-between">
          <h1 className="font-bold text-base text-gray-800">CDD</h1>
          <button
            type="button"
            className="p-1 hover:bg-gray-100 rounded-full text-gray-400 cursor-pointer"
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-3 pt-2 pb-1">
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {MODE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={classNames(
                  "flex-1 text-[10px] font-semibold py-1.5 rounded-md transition-all cursor-pointer",
                  mode === tab.key
                    ? "bg-white text-gray-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700",
                )}
                onClick={() => {
                  setMode(tab.key);
                  setSearchQuery("");
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {showSidebarContent && (
          <>
            <div className="px-3 py-1.5">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                <input
                  type="text"
                  placeholder={mode === "contracts" ? "Search contracts..." : "Search rules..."}
                  className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg text-xs transition-all outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-1.5 py-1 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-[10px] [&::-webkit-scrollbar-thumb:hover]:bg-gray-300">
              {mode === "contracts" && (
                <>
                  {isTreeLoading && (
                    <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
                  )}

                  {treeError && <div className="text-center py-8 text-red-500 text-sm">Error</div>}

                  {treeData && !treeData.exists && (
                    <div className="mx-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                      contract/ directory not found
                    </div>
                  )}

                  {treeData?.exists &&
                    filteredTree.map((node) => (
                      <CddTreeNodeItem
                        key={node.path}
                        node={node}
                        depth={0}
                        onRefetch={refetchTree}
                        activeNodePath={activeNodePath}
                        onSelect={setActiveNodePath}
                      />
                    ))}
                </>
              )}

              {mode === "rules" && (
                <CddRulesList
                  rules={filteredRules}
                  activeRuleKey={activeRuleKey}
                  onSelect={setActiveRuleKey}
                />
              )}
            </nav>
          </>
        )}

        {mode === "ac" && (
          <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
            <ListChecksIcon className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">AC view</p>
          </div>
        )}

        {mode === "contracts" && treeData?.exists && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400">{fileCount} files</div>
          </div>
        )}

        {mode === "rules" && rulesData && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
            <div className="text-xs text-gray-400">{rulesData.rules.length} rules</div>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col bg-white min-w-0">{renderMainContent()}</main>
    </div>
  );
}
