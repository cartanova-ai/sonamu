import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import FolderOpenIcon from "~icons/lucide/folder-open";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SearchIcon from "~icons/lucide/search";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { CddDocumentDetail } from "./cdd/components/cdd_document_detail";
import { CddTreeNodeItem } from "./cdd/components/cdd_tree_node_item";
import { CddService } from "./cdd/service";
import type { CddTreeNode } from "./cdd/types";
import { countFiles, filterTree, findTreeNode, sortTree } from "./cdd/utils/tree";

export const Route = createFileRoute("/cdd")({
  component: CddPage,
});

function CddPage() {
  const { SD } = useSonamuContext();
  const { data, error, refetch } = CddService.useCddTree();
  const isLoading = !error && !data;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNodePath, setActiveNodePath] = useState<string | null>(null);

  const sortedTree = useMemo(() => (data?.tree ? sortTree(data.tree, true) : []), [data?.tree]);

  const filteredTree = useMemo(
    () => filterTree(sortedTree, searchQuery),
    [sortedTree, searchQuery],
  );

  const fileCount = useMemo(() => (data?.tree ? countFiles(data.tree) : 0), [data?.tree]);

  const activeNode: CddTreeNode | null = useMemo(() => {
    if (!activeNodePath || !data?.tree) return null;
    return findTreeNode(data.tree, activeNodePath);
  }, [activeNodePath, data?.tree]);

  const renderMainContent = () => {
    if (activeNode?.type === "file") {
      return (
        <CddDocumentDetail node={activeNode} onRefetch={refetch} onSelect={setActiveNodePath} />
      );
    }

    return (
      <>
        <header className="h-14 border-b border-gray-100 flex items-center px-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{SD("cdd.title")}</span>
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
              <p className="text-sm">{SD("cdd.selectDocument")}</p>
              <p className="text-xs text-gray-300">{SD("cdd.selectDocumentDesc")}</p>
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
          <h1 className="font-bold text-base text-gray-800">{SD("cdd.title")}</h1>
          <button
            type="button"
            className="p-1 hover:bg-gray-100 rounded-full text-gray-400 cursor-pointer"
            onClick={() => refetch()}
            title={SD("cdd.refresh")}
          >
            <RefreshCwIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="px-3 py-2">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
            <input
              type="text"
              placeholder={SD("cdd.searchPlaceholder")}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg text-xs transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-1.5 py-1 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-[10px] [&::-webkit-scrollbar-thumb:hover]:bg-gray-300">
          {isLoading && (
            <div className="text-center py-8 text-gray-400 text-sm">{SD("common.loading")}</div>
          )}

          {error && (
            <div className="text-center py-8 text-red-500 text-sm">{SD("common.error")}</div>
          )}

          {data && !data.exists && (
            <div className="mx-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              {SD("cdd.noContractDir")}
            </div>
          )}

          {data?.exists &&
            filteredTree.map((node) => (
              <CddTreeNodeItem
                key={node.path}
                node={node}
                depth={0}
                onRefetch={refetch}
                activeNodePath={activeNodePath}
                onSelect={setActiveNodePath}
              />
            ))}
        </nav>

        {data?.exists && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 space-y-2">
            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-500">
              <div className="flex items-center gap-1.5">
                <FileTextIcon className="w-3 h-3 text-gray-400" />
                <span className="font-medium">Contract</span>
              </div>
              <div className="flex items-center gap-1.5">
                <FileCodeIcon className="w-3 h-3 text-gray-400" />
                <span className="font-medium">Spec</span>
              </div>
            </div>
            <div className="text-xs text-gray-400">
              {SD("cdd.documentCount").replace("{count}", String(fileCount))}
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col bg-white min-w-0">{renderMainContent()}</main>
    </div>
  );
}
