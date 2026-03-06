import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import FolderIcon from "~icons/lucide/folder";
import FolderOpenIcon from "~icons/lucide/folder-open";
import PencilIcon from "~icons/lucide/pencil";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SearchIcon from "~icons/lucide/search";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { defaultCatch } from "../services/sonamu.shared";
import type { CddTreeNode } from "../services/sonamu-ui.service";
import { SonamuUIService } from "../services/sonamu-ui.service";

function CddFileIcon({
  fileType,
  name,
  isActive,
  className,
}: {
  fileType?: "contract" | "spec";
  name: string;
  isActive?: boolean;
  className?: string;
}) {
  const size = className ?? "w-[18px] h-[18px]";
  const color = isActive ? "text-blue-600" : "text-gray-400";

  if (name === "main.contract.json") {
    return <FileTextIcon className={classNames(size, color)} />;
  }
  if (fileType === "spec") {
    return <FileCodeIcon className={classNames(size, color)} />;
  }
  return <FileTextIcon className={classNames(size, color)} />;
}

export const Route = createFileRoute("/cdd")({
  component: CddPage,
});

function countFiles(nodes: CddTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") {
      count++;
    }
    if (node.children) {
      count += countFiles(node.children);
    }
  }
  return count;
}

function filterTree(nodes: CddTreeNode[], query: string): CddTreeNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  return nodes
    .map((node) => {
      if (node.type === "directory") {
        const filtered = filterTree(node.children ?? [], query);
        if (filtered.length > 0) {
          return { ...node, children: filtered };
        }
        if (node.name.toLowerCase().includes(lower)) {
          return node;
        }
        return null;
      }
      return node.name.toLowerCase().includes(lower) ? node : null;
    })
    .filter((n): n is CddTreeNode => n !== null);
}

/** 파일 -> 디렉터리, contract -> spec, 알파벳 순. main.contract.json은 항상 최상단 */
function sortTree(nodes: CddTreeNode[], isRoot = false): CddTreeNode[] {
  const fileTypeOrder = (ft?: string) => (ft === "contract" ? 0 : ft === "spec" ? 1 : 2);
  const sorted = [...nodes].sort((a, b) => {
    if (isRoot) {
      const aIsMain = a.name === "main.contract.json";
      const bIsMain = b.name === "main.contract.json";
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
    }
    if (a.type !== b.type) {
      return a.type === "file" ? -1 : 1;
    }
    if (a.type === "file" && b.type === "file") {
      const ftDiff = fileTypeOrder(a.fileType) - fileTypeOrder(b.fileType);
      if (ftDiff !== 0) return ftDiff;
    }
    return a.name.localeCompare(b.name);
  });
  return sorted.map((node) =>
    node.children ? { ...node, children: sortTree(node.children) } : node,
  );
}

function CddPage() {
  const { SD } = useSonamuContext();
  const { data, error, refetch } = SonamuUIService.useCddTree();
  const isLoading = !error && !data;
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNodePath, setActiveNodePath] = useState<string | null>(null);

  const sortedTree = useMemo(() => (data?.tree ? sortTree(data.tree, true) : []), [data?.tree]);

  const filteredTree = useMemo(
    () => filterTree(sortedTree, searchQuery),
    [sortedTree, searchQuery],
  );

  const fileCount = useMemo(() => (data?.tree ? countFiles(data.tree) : 0), [data?.tree]);

  const activeNode = useMemo(() => {
    if (!activeNodePath || !data?.tree) return null;
    const find = (nodes: CddTreeNode[]): CddTreeNode | null => {
      for (const node of nodes) {
        if (node.path === activeNodePath) return node;
        if (node.children) {
          const found = find(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return find(data.tree);
  }, [activeNodePath, data?.tree]);

  return (
    <div className="flex h-[calc(100vh-var(--spacing-gnb))] bg-gray-50 text-gray-900">
      {/* 사이드바 */}
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm shrink-0">
        {/* 헤더 */}
        <div className="px-4 h-14 border-b border-gray-100 flex items-center justify-between">
          <h1 className="font-bold text-lg text-gray-800">{SD("cdd.title")}</h1>
          <button
            type="button"
            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 cursor-pointer"
            onClick={() => refetch()}
            title={SD("cdd.refresh")}
          >
            <RefreshCwIcon className="w-4 h-4" />
          </button>
        </div>

        {/* 검색 */}
        <div className="px-4 py-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder={SD("cdd.searchPlaceholder")}
              className="w-full pl-9 pr-4 py-2 bg-gray-100 border border-transparent focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-lg text-sm transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 트리 */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-[10px] [&::-webkit-scrollbar-thumb:hover]:bg-gray-300">
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
              <TreeNodeItem
                key={node.path}
                node={node}
                depth={0}
                onRefetch={refetch}
                activeNodePath={activeNodePath}
                onSelect={setActiveNodePath}
              />
            ))}
        </nav>

        {/* 하단 */}
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

      {/* 메인 콘텐츠 */}
      <main className="flex-1 flex flex-col bg-white min-w-0">
        {activeNode && activeNode.type === "file" ? (
          <SelectedNodeDetail node={activeNode} onRefetch={refetch} />
        ) : (
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
        )}
      </main>
    </div>
  );
}

function SelectedNodeDetail({ node, onRefetch }: { node: CddTreeNode; onRefetch: () => void }) {
  const { SD } = useSonamuContext();
  const [editing, setEditing] = useState(false);
  const { data, isLoading, refetch: refetchContent } = SonamuUIService.useReadCddContent(node.path);

  const handleEdit = () => {
    setEditing(true);
    SonamuUIService.editCddContent(node.path)
      .then(() => {
        onRefetch();
        refetchContent();
      })
      .catch(defaultCatch)
      .finally(() => setEditing(false));
  };

  const metaEntries = useMemo(() => {
    if (!data) return [];
    return Object.entries(data).filter(([key]) => key !== "content");
  }, [data]);

  const content = typeof data?.content === "string" ? data.content : null;

  return (
    <>
      {/* 헤더: 메타 정보 */}
      <header className="border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between px-8 h-14">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{SD("cdd.title")}</span>
            <ChevronRightIcon className="w-3.5 h-3.5" />
            <CddFileIcon fileType={node.fileType} name={node.name} className="w-4 h-4" />
            <span className="text-gray-900 font-medium">{node.name}</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleEdit}
            disabled={editing}
          >
            <PencilIcon className="w-3.5 h-3.5" />
            {editing ? SD("cdd.editing") : SD("cdd.editContent")}
          </button>
        </div>

        {/* 메타 키-값 표시 */}
        {metaEntries.length > 0 && (
          <div className="px-8 py-3 bg-gray-50 border-t border-gray-100 space-y-1.5">
            {metaEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-3 text-sm">
                <span className="text-gray-400 font-medium min-w-[100px] shrink-0">{key}</span>
                <span className="text-gray-700">
                  {Array.isArray(value) ? value.join(", ") : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* 본문: content */}
      <div className="flex-1 overflow-y-auto p-8">
        {isLoading && (
          <div className="text-center py-8 text-gray-400 text-sm">{SD("common.loading")}</div>
        )}
        {content !== null && (
          <div
            className={classNames(
              "max-w-4xl mx-auto prose prose-sm prose-gray",
              "prose-headings:text-gray-900",
              "prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-1.5",
              "prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-gray-900 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
              "prose-pre:bg-gray-800 prose-pre:rounded-lg",
              "prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline",
            )}
          >
            <Markdown>{content}</Markdown>
          </div>
        )}
        {!isLoading && content === null && data && (
          <div className="text-center py-8 text-gray-400 text-sm">No content</div>
        )}
      </div>
    </>
  );
}

function TreeNodeItem({
  node,
  depth,
  onRefetch,
  activeNodePath,
  onSelect,
}: {
  node: CddTreeNode;
  depth: number;
  onRefetch: () => void;
  activeNodePath: string | null;
  onSelect: (path: string) => void;
}) {
  const { SD } = useSonamuContext();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const isActive = activeNodePath === node.path;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
    SonamuUIService.editCddContent(node.path)
      .then(() => {
        onRefetch();
      })
      .catch(defaultCatch)
      .finally(() => setEditing(false));
  };

  const handleClick = () => {
    onSelect(node.path);
    if (node.type === "directory") {
      setExpanded(!expanded);
    }
  };

  return (
    <div className="w-full">
      <div
        className={classNames(
          "flex items-center group px-2 py-1.5 rounded-md cursor-pointer transition-colors duration-150",
          isActive ? "bg-blue-50 text-blue-700" : "hover:bg-gray-100 text-gray-700",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onKeyDown={undefined}
      >
        {/* 접기/펴기 아이콘 */}
        <div className="w-5 h-5 flex items-center justify-center mr-1 shrink-0">
          {node.type === "directory" &&
            (expanded ? (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5" />
            ))}
        </div>

        {/* 파일/폴더 아이콘 */}
        <div className="mr-2 shrink-0">
          {node.type === "directory" ? (
            expanded ? (
              <FolderOpenIcon
                className={classNames(
                  "w-[18px] h-[18px]",
                  isActive ? "text-blue-600" : "text-gray-400",
                )}
              />
            ) : (
              <FolderIcon
                className={classNames(
                  "w-[18px] h-[18px]",
                  isActive ? "text-blue-600" : "text-gray-400",
                )}
              />
            )
          ) : (
            <CddFileIcon fileType={node.fileType} name={node.name} isActive={isActive} />
          )}
        </div>

        {/* 이름 */}
        <span className="flex-1 truncate text-sm font-medium">{node.name}</span>

        {/* 호버 시 편집 버튼 */}
        {node.type === "file" && (
          <div className="opacity-0 group-hover:opacity-100 flex items-center shrink-0">
            <button
              type="button"
              className="p-1 hover:text-gray-900 cursor-pointer disabled:opacity-50"
              onClick={handleEdit}
              disabled={editing}
              title={editing ? SD("cdd.editing") : SD("cdd.editContent")}
            >
              <PencilIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 자식 */}
      {node.type === "directory" && expanded && node.children && (
        <div className="mt-0.5">
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              onRefetch={onRefetch}
              activeNodePath={activeNodePath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
