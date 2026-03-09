import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { Fragment, useMemo, useState } from "react";
import Markdown from "react-markdown";
import AlertCircleIcon from "~icons/lucide/alert-circle";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import BoxIcon from "~icons/lucide/box";
import CheckCircle2Icon from "~icons/lucide/check-circle-2";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import ClockIcon from "~icons/lucide/clock";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import FolderIcon from "~icons/lucide/folder";
import FolderOpenIcon from "~icons/lucide/folder-open";
import GitBranchIcon from "~icons/lucide/git-branch";
import HashIcon from "~icons/lucide/hash";
import Link2Icon from "~icons/lucide/link-2";
import PencilIcon from "~icons/lucide/pencil";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SearchIcon from "~icons/lucide/search";
import TerminalIcon from "~icons/lucide/terminal";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { defaultCatch } from "../services/sonamu.shared";
import type { CddTreeNode } from "../services/sonamu-ui.service";
import { SonamuUIService } from "../services/sonamu-ui.service";

type SpecData = {
  schemaVersion?: number;
  summary?: string;
  description?: string[];
  acceptanceCriteria?: string[];
  lastModified?: string;
  status?: string;
  sources?: string[];
  contracts?: string[];
  dependsOnSpecs?: string[];
  modules?: Record<string, string>;
  interfaces?: Record<string, string>;
  dataFlow?: string[];
  errorHandling?: Record<string, string>;
  constraints?: string[];
};

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

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" },
  "in-progress": {
    label: "In Progress",
    color: "bg-blue-50 text-blue-600 border-blue-200",
    dot: "bg-blue-500",
  },
  done: {
    label: "Done",
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

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

  const renderMainContent = () => {
    if (activeNode?.type === "file") {
      if (activeNode.fileType === "spec") {
        return <SpecNodeDetail node={activeNode} />;
      }
      return <ContractNodeDetail node={activeNode} onRefetch={refetch} />;
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
      <main className="flex-1 flex flex-col bg-white min-w-0">{renderMainContent()}</main>
    </div>
  );
}

function ContractNodeDetail({ node, onRefetch }: { node: CddTreeNode; onRefetch: () => void }) {
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

        {metaEntries.length > 0 && (
          <div className="px-8 py-3 bg-gray-50 border-t border-gray-100 space-y-1.5">
            {metaEntries.map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-3 text-sm">
                <span className="text-gray-400 font-medium min-w-[100px] shrink-0">{key}</span>
                <span className="text-gray-700">
                  {Array.isArray(value)
                    ? value.some((v) => typeof v === "object" && v !== null)
                      ? value.map((item, i) => {
                          const obj = item as Record<string, unknown>;
                          const parts = Object.entries(obj).map(([k, v]) =>
                            Array.isArray(v) ? `${k}: ${v.join(", ")}` : `${k}: ${v}`,
                          );
                          return (
                            <span key={i} className={i > 0 ? "block" : ""}>
                              {parts.join(" | ")}
                            </span>
                          );
                        })
                      : value.join(", ")
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </header>

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

const SPEC_SECTIONS = [
  { id: "summary", title: "설계 개요", Icon: FileTextIcon },
  { id: "criteria", title: "판정 기준", Icon: CheckCircle2Icon },
  { id: "architecture", title: "구조 설계", Icon: BoxIcon },
  { id: "dataflow", title: "데이터 흐름", Icon: GitBranchIcon },
  { id: "errors", title: "에러 처리", Icon: AlertTriangleIcon },
  { id: "technical", title: "기술 제약/참조", Icon: TerminalIcon },
] as const;

function SpecNodeDetail({ node }: { node: CddTreeNode }) {
  const { SD } = useSonamuContext();
  const { data, isLoading } = SonamuUIService.useReadCddContent(node.path);
  const [activeSection, setActiveSection] = useState("summary");

  const spec: SpecData = (data as SpecData) ?? {};
  const statusInfo = STATUS_MAP[spec.status ?? ""] ?? STATUS_MAP.draft;

  const hasDescription = spec.description && spec.description.length > 0;
  const hasAcceptanceCriteria = spec.acceptanceCriteria && spec.acceptanceCriteria.length > 0;
  const hasModules = spec.modules && Object.keys(spec.modules).length > 0;
  const hasInterfaces = spec.interfaces && Object.keys(spec.interfaces).length > 0;
  const hasDataFlow = spec.dataFlow && spec.dataFlow.length > 0;
  const hasErrorHandling = spec.errorHandling && Object.keys(spec.errorHandling).length > 0;
  const hasConstraints = spec.constraints && spec.constraints.length > 0;
  const hasSources = spec.sources && spec.sources.length > 0;
  const hasContracts = spec.contracts && spec.contracts.length > 0;
  const hasDependsOnSpecs = spec.dependsOnSpecs && spec.dependsOnSpecs.length > 0;
  const hasTechnical = hasConstraints || hasSources || hasContracts || hasDependsOnSpecs;

  const visibleSections = useMemo(() => {
    return SPEC_SECTIONS.filter((s) => {
      switch (s.id) {
        case "summary":
          return hasDescription;
        case "criteria":
          return hasAcceptanceCriteria;
        case "architecture":
          return hasModules || hasInterfaces;
        case "dataflow":
          return hasDataFlow;
        case "errors":
          return hasErrorHandling;
        case "technical":
          return hasTechnical;
        default:
          return false;
      }
    });
  }, [
    hasDescription,
    hasAcceptanceCriteria,
    hasModules,
    hasInterfaces,
    hasDataFlow,
    hasErrorHandling,
    hasTechnical,
  ]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-sm">{SD("common.loading")}</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 상단 네비게이션 바 */}
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="font-bold text-lg tracking-tight truncate">
              {spec.summary ?? node.name}
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div
              className={classNames(
                "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border",
                statusInfo.color,
              )}
            >
              <span className={classNames("w-2 h-2 rounded-full", statusInfo.dot)} />
              {statusInfo.label}
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1">
              <ClockIcon className="w-3 h-3" /> {spec.lastModified ?? "-"}
            </div>
          </div>
        </div>
      </nav>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-7xl mx-auto flex px-6 py-10 gap-12">
          {/* 좌측 목차 네비게이션 */}
          <aside className="hidden lg:block w-48 flex-shrink-0 sticky top-6 h-fit">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 ml-4">
              Contents
            </p>
            <ul className="space-y-1">
              {visibleSections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#spec-${s.id}`}
                    onClick={() => setActiveSection(s.id)}
                    className={classNames(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                      activeSection === s.id
                        ? "bg-slate-100 text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                    )}
                  >
                    <s.Icon className="w-4 h-4" />
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          {/* 메인 콘텐츠 영역 */}
          <div className="flex-1 max-w-3xl">
            {/* 설계 개요 */}
            {hasDescription && (
              <SpecViewerSection id="spec-summary" title="설계 개요" Icon={FileTextIcon}>
                <div
                  className={classNames(
                    "prose prose-slate max-w-none",
                    "prose-headings:text-slate-900",
                    "prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-900 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
                  )}
                >
                  <Markdown>{spec.description?.join("\n")}</Markdown>
                </div>
              </SpecViewerSection>
            )}

            {/* 판정 기준 */}
            {hasAcceptanceCriteria && (
              <SpecViewerSection id="spec-criteria" title="완료 판정 기준" Icon={CheckCircle2Icon}>
                <div className="space-y-3">
                  {spec.acceptanceCriteria?.map((item, i) => (
                    <div
                      key={i}
                      className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50"
                    >
                      <div className="mt-1 text-blue-500 shrink-0">
                        <CheckCircle2Icon className="w-[18px] h-[18px]" />
                      </div>
                      <p className="text-slate-700 leading-6">{item}</p>
                    </div>
                  ))}
                </div>
              </SpecViewerSection>
            )}

            {/* 구조 설계 */}
            {(hasModules || hasInterfaces) && (
              <SpecViewerSection id="spec-architecture" title="구조 설계" Icon={BoxIcon}>
                <div className="space-y-8">
                  {hasModules && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                        주요 모듈
                      </h4>
                      <div className="grid grid-cols-1 gap-3">
                        {Object.entries(spec.modules ?? {}).map(([name, desc]) => (
                          <div
                            key={name}
                            className="flex items-center justify-between p-4 border border-slate-100 rounded-xl shadow-sm"
                          >
                            <span className="font-mono text-sm font-bold text-slate-800">
                              {name}
                            </span>
                            <span className="text-sm text-slate-500">{desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasInterfaces && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
                        인터페이스 및 메서드
                      </h4>
                      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-3 font-bold text-slate-700">
                                Interface / Method
                              </th>
                              <th className="px-4 py-3 font-bold text-slate-700">Description</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {Object.entries(spec.interfaces ?? {}).map(([name, desc]) => (
                              <tr key={name} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-mono text-indigo-600 font-medium whitespace-nowrap">
                                  {name}
                                </td>
                                <td className="px-4 py-3 text-slate-600">{desc}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </SpecViewerSection>
            )}

            {/* 데이터 흐름 */}
            {hasDataFlow && (
              <SpecViewerSection id="spec-dataflow" title="데이터 흐름" Icon={GitBranchIcon}>
                <div className="flex flex-col items-center gap-2 max-w-lg mx-auto py-4">
                  {spec.dataFlow?.map((step, i) => (
                    <Fragment key={i}>
                      <div className="w-full p-3 bg-white border border-slate-200 rounded-lg text-center font-medium text-slate-700 shadow-sm text-sm">
                        {step}
                      </div>
                      {i < (spec.dataFlow?.length ?? 0) - 1 && (
                        <div className="flex flex-col items-center">
                          <div className="w-0.5 h-6 bg-slate-200" />
                          <ChevronDownIcon className="w-3.5 h-3.5 text-slate-300 -mt-1" />
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              </SpecViewerSection>
            )}

            {/* 에러 처리 */}
            {hasErrorHandling && (
              <SpecViewerSection
                id="spec-errors"
                title="에러 처리 및 예외"
                Icon={AlertTriangleIcon}
              >
                <div className="space-y-3">
                  {Object.entries(spec.errorHandling ?? {}).map(([code, msg]) => (
                    <div
                      key={code}
                      className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50"
                    >
                      <div className="mt-1 text-slate-400 shrink-0">
                        <AlertCircleIcon className="w-[18px] h-[18px]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-tight mb-1">
                          {code}
                        </div>
                        <p className="text-slate-700 text-sm leading-6">{msg}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SpecViewerSection>
            )}

            {/* 기술 제약 및 참조 */}
            {hasTechnical && (
              <SpecViewerSection id="spec-technical" title="기술 제약 및 참조" Icon={TerminalIcon}>
                <div className="space-y-6">
                  {hasConstraints && (
                    <div className="bg-slate-50 rounded-xl px-5 pb-5 border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                        기술 제약 사항
                      </h4>
                      <ul className="space-y-2">
                        {spec.constraints?.map((c, i) => (
                          <li key={i} className="text-sm text-slate-600 flex gap-2">
                            <span className="text-blue-500">•</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {hasSources && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          소스 코드
                        </h4>
                        {spec.sources?.map((s) => (
                          <div key={s} className="flex items-center gap-2 text-xs text-slate-500">
                            <Link2Icon className="w-3 h-3 shrink-0" /> {s}
                          </div>
                        ))}
                      </div>
                    )}
                    {(hasContracts || hasDependsOnSpecs) && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          참조 문서
                        </h4>
                        {spec.contracts?.map((c) => (
                          <div key={c} className="flex items-center gap-2 text-xs text-slate-500">
                            <HashIcon className="w-3 h-3 shrink-0" /> {c}
                          </div>
                        ))}
                        {spec.dependsOnSpecs?.map((d) => (
                          <div key={d} className="flex items-center gap-2 text-xs text-slate-500">
                            <HashIcon className="w-3 h-3 shrink-0" /> {d}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </SpecViewerSection>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecViewerSection({
  id,
  title,
  Icon,
  children,
}: {
  id: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12 scroll-mt-20">
      <div className="flex items-baseline gap-2 mb-6 border-b border-slate-200 pb-2">
        <Icon className="w-5 h-5 text-slate-400 translate-y-[1px]" />
        <h2 className="text-xl font-bold text-slate-800">{title}</h2>
      </div>
      <div className="pl-0 md:pl-7">{children}</div>
    </section>
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

        {/* 호버 시 편집 버튼 (contract 파일만) */}
        {node.type === "file" && node.fileType === "contract" && (
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
