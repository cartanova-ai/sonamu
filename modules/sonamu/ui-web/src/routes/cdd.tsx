import { createFileRoute } from "@tanstack/react-router";
import classNames from "classnames";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import AlertCircleIcon from "~icons/lucide/alert-circle";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import BoxIcon from "~icons/lucide/box";
import CheckCircle2Icon from "~icons/lucide/check-circle-2";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import ClockIcon from "~icons/lucide/clock";
import Code2Icon from "~icons/lucide/code-2";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import FolderIcon from "~icons/lucide/folder";
import FolderOpenIcon from "~icons/lucide/folder-open";
import GitBranchIcon from "~icons/lucide/git-branch";
import GlobeIcon from "~icons/lucide/globe";
import HashIcon from "~icons/lucide/hash";
import Link2Icon from "~icons/lucide/link-2";
import ListIcon from "~icons/lucide/list";
import PencilIcon from "~icons/lucide/pencil";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import SearchIcon from "~icons/lucide/search";
import TerminalIcon from "~icons/lucide/terminal";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { defaultCatch } from "../services/sonamu.shared";
import type {
  CddContentEnvelope,
  CddSchema,
  CddSchemaField,
  CddTreeNode,
} from "../services/sonamu-ui.service";
import { SonamuUIService } from "../services/sonamu-ui.service";

/* ========================================================================
 * Schema Field Renderer Registry
 * ======================================================================== */

type FieldRendererProps = {
  field: CddSchemaField;
  value: unknown;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** camelCase를 사람이 읽기 좋은 형태로 변환 */
const humanize = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());

/** string[] 렌더러 */
function StringListRenderer({ value }: FieldRendererProps) {
  const items = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="flex gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
          <span className="text-slate-700 text-sm leading-6">{item}</span>
        </div>
      ))}
    </div>
  );
}

/** Record<string, string> 렌더러 */
function StringRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => typeof v === "string")
    : [];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 font-bold text-slate-700">Key</th>
            <th className="px-4 py-3 font-bold text-slate-700">Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([k, v]) => (
            <tr key={k} className="hover:bg-slate-50/50">
              <td className="px-4 py-3 font-mono text-sm font-medium text-slate-800 whitespace-nowrap">
                {k}
              </td>
              <td className="px-4 py-3 text-slate-600">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Record<string, object> 렌더러 */
function ObjectRecordRenderer({ value }: FieldRendererProps) {
  const entries = isPlainObject(value)
    ? Object.entries(value).filter(([, v]) => isPlainObject(v))
    : [];
  return (
    <div className="space-y-4">
      {entries.map(([key, obj]) => {
        const record = obj as Record<string, unknown>;
        return (
          <div key={key} className="rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
              <span className="font-mono text-sm font-semibold text-slate-800">{key}</span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {Object.entries(record).map(([prop, val]) => (
                <div key={prop} className="flex gap-3 text-sm">
                  <span className="text-slate-400 font-medium min-w-[100px] shrink-0">
                    {humanize(prop)}
                  </span>
                  <span className="text-slate-700">
                    {Array.isArray(val) ? val.join(", ") : String(val ?? "")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const FIELD_RENDERERS: Record<
  CddSchemaField["type"],
  {
    Component: React.ComponentType<FieldRendererProps>;
    isEmpty: (value: unknown) => boolean;
  }
> = {
  "string[]": {
    Component: StringListRenderer,
    isEmpty: (v) => !Array.isArray(v) || v.length === 0,
  },
  "Record<string, string>": {
    Component: StringRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
  },
  "Record<string, object>": {
    Component: ObjectRecordRenderer,
    isEmpty: (v) => !isPlainObject(v) || Object.keys(v).length === 0,
  },
};

const getFieldLabel = (field: CddSchemaField) => field.label ?? humanize(field.name);

/* ========================================================================
 * Section Descriptor — TOC와 본문의 단일 소스
 * ======================================================================== */

type SectionDescriptor = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  render: () => React.ReactNode;
};

/** schema 커스텀 필드에서 렌더링할 아이콘을 결정 */
const FIELD_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: FileTextIcon,
  domainGlossary: BoxIcon,
  userRoles: GlobeIcon,
  businessRules: AlertTriangleIcon,
  edgeCases: AlertCircleIcon,
  modules: BoxIcon,
  interfaces: Code2Icon,
  dataFlow: GitBranchIcon,
  errorHandling: AlertTriangleIcon,
  constraints: TerminalIcon,
  api: GlobeIcon,
  types: Code2Icon,
};

function getFieldIcon(fieldName: string): React.ComponentType<{ className?: string }> {
  return FIELD_ICON_MAP[fieldName] ?? ListIcon;
}

/* ========================================================================
 * Shared Section Components
 * ======================================================================== */

function ViewerSection({
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

function SectionLayout({
  navChildren,
  tocSections,
  activeSection,
  onSectionClick,
  children,
}: {
  navChildren: React.ReactNode;
  tocSections: SectionDescriptor[];
  activeSection: string;
  onSectionClick: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <nav className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 shrink-0">
        <div className="max-w-7xl mx-auto flex justify-between items-center">{navChildren}</div>
      </nav>

      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-7xl mx-auto flex px-6 py-10 gap-12">
          <aside className="hidden lg:block w-48 flex-shrink-0 sticky top-6 h-fit">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 ml-4">
              Contents
            </p>
            <ul className="space-y-1">
              {tocSections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    onClick={() => onSectionClick(s.id)}
                    className={classNames(
                      "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
                      activeSection === s.id
                        ? "bg-slate-100 text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50",
                    )}
                  >
                    <s.icon className="w-4 h-4" />
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </aside>

          <div className="flex-1 max-w-3xl">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** schema의 커스텀 필드들에서 SectionDescriptor 배열을 생성 */
function buildCustomFieldSections(
  schema: CddSchema | null,
  document: Record<string, unknown>,
  prefix: string,
): SectionDescriptor[] {
  if (!schema) return [];
  const sections: SectionDescriptor[] = [];

  for (const field of schema.fields) {
    const renderer = FIELD_RENDERERS[field.type];
    const value = document[field.name];
    if (!renderer || renderer.isEmpty(value)) continue;

    const { Component } = renderer;
    sections.push({
      id: `${prefix}-${field.name}`,
      title: getFieldLabel(field),
      icon: getFieldIcon(field.name),
      render: () => <Component field={field} value={value} />,
    });
  }

  return sections;
}

/* ========================================================================
 * Common Types & Utilities
 * ======================================================================== */

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

/* ========================================================================
 * CddPage (main)
 * ======================================================================== */

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
      return <DocumentDetail node={activeNode} onRefetch={refetch} onSelect={setActiveNodePath} />;
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
      <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-sm shrink-0">
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

/* ========================================================================
 * DocumentDetail — Contract/Spec 통합 뷰어
 * ======================================================================== */

function DocumentDetail({
  node,
  onRefetch,
  onSelect,
}: {
  node: CddTreeNode;
  onRefetch: () => void;
  onSelect: (path: string) => void;
}) {
  const { SD } = useSonamuContext();
  const [editing, setEditing] = useState(false);
  const { data, isLoading, refetch: refetchContent } = SonamuUIService.useReadCddContent(node.path);
  const [activeSection, setActiveSection] = useState("");

  const envelope: CddContentEnvelope | null = data ?? null;
  const doc = envelope?.document ?? {};
  const schema = envelope?.schema ?? null;
  const fileType = envelope?.fileType ?? node.fileType ?? "contract";

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

  /** spec 파일 기준 상대 경로를 contract/ 기준 경로로 변환 */
  const resolveRefPath = (ref: string): string => {
    const dir = node.path.includes("/") ? node.path.substring(0, node.path.lastIndexOf("/")) : "";
    const parts = (dir ? `${dir}/${ref}` : ref).split("/");
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === "." || p === "") continue;
      if (p === "..") {
        resolved.pop();
      } else {
        resolved.push(p);
      }
    }
    return resolved.join("/");
  };

  const contractDir = node.path.includes("/")
    ? node.path.substring(0, node.path.lastIndexOf("/"))
    : "";

  const featureToSpecPath = (key: string): string =>
    contractDir ? `${contractDir}/${key}.spec.json` : `${key}.spec.json`;

  // Contract/Spec 고정 섹션 + schema 커스텀 필드 → 단일 SectionDescriptor[]
  const sections = useMemo((): SectionDescriptor[] => {
    const result: SectionDescriptor[] = [];

    if (fileType === "contract") {
      // Contract 고정 필드: features
      const features = doc.features as Record<string, string> | undefined;
      if (features && Object.keys(features).length > 0) {
        result.push({
          id: "contract-features",
          title: "Features",
          icon: FileCodeIcon,
          render: () => (
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-bold text-slate-700">Feature</th>
                    <th className="px-4 py-3 font-bold text-slate-700">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(features).map(([key, desc]) => (
                    <tr key={key} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="font-mono text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
                          onClick={() => onSelect(featureToSpecPath(key))}
                        >
                          {key}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        });
      }
    }

    if (fileType === "spec") {
      // Spec 고정 필드: description
      const description = doc.description as string[] | undefined;
      if (description && description.length > 0) {
        result.push({
          id: "spec-summary",
          title: "Overview",
          icon: FileTextIcon,
          render: () => (
            <div
              className={classNames(
                "prose prose-slate max-w-none",
                "prose-headings:text-slate-900",
                "prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-900 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
              )}
            >
              <Markdown>{description.join("\n")}</Markdown>
            </div>
          ),
        });
      }

      // Spec 고정 필드: acceptanceCriteria
      const criteria = doc.acceptanceCriteria as string[] | undefined;
      if (criteria && criteria.length > 0) {
        result.push({
          id: "spec-criteria",
          title: "Acceptance Criteria",
          icon: CheckCircle2Icon,
          render: () => (
            <div className="space-y-3">
              {criteria.map((item, i) => (
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
          ),
        });
      }
    }

    // Schema 커스텀 필드
    result.push(...buildCustomFieldSections(schema, doc, fileType));

    if (fileType === "spec") {
      // Spec 고정 필드: sources, contracts, dependsOnSpecs
      const sources = doc.sources as string[] | undefined;
      const contracts = doc.contracts as string[] | undefined;
      const dependsOnSpecs = doc.dependsOnSpecs as string[] | undefined;
      const hasSources = sources && sources.length > 0;
      const hasContracts = contracts && contracts.length > 0;
      const hasDependsOnSpecs = dependsOnSpecs && dependsOnSpecs.length > 0;

      if (hasSources || hasContracts || hasDependsOnSpecs) {
        result.push({
          id: "spec-references",
          title: "References",
          icon: Link2Icon,
          render: () => (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hasSources && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Sources
                  </h4>
                  {sources.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 cursor-pointer transition-colors"
                      onClick={() => SonamuUIService.openCddSource(s).catch(defaultCatch)}
                    >
                      <Link2Icon className="w-3 h-3 shrink-0" /> {s}
                    </button>
                  ))}
                </div>
              )}
              {(hasContracts || hasDependsOnSpecs) && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Documents
                  </h4>
                  {contracts?.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 cursor-pointer transition-colors"
                      onClick={() => onSelect(resolveRefPath(c))}
                    >
                      <HashIcon className="w-3 h-3 shrink-0" /> {c}
                    </button>
                  ))}
                  {dependsOnSpecs?.map((d) => (
                    <button
                      type="button"
                      key={d}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 cursor-pointer transition-colors"
                      onClick={() => onSelect(resolveRefPath(d))}
                    >
                      <HashIcon className="w-3 h-3 shrink-0" /> {d}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ),
        });
      }
    }

    return result;
  }, [doc, schema, fileType, onSelect, contractDir, node.path]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400 text-sm">{SD("common.loading")}</div>
      </div>
    );
  }

  const summary = doc.summary as string | undefined;
  const status = doc.status as string | undefined;
  const lastModified = doc.lastModified as string | undefined;
  const schemaId = doc.schema as string | undefined;
  const statusInfo = STATUS_MAP[status ?? ""] ?? STATUS_MAP.draft;

  const navContent = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <CddFileIcon fileType={node.fileType} name={node.name} className="w-5 h-5" />
        <h1 className="font-bold text-lg tracking-tight truncate">
          {fileType === "spec" ? (summary ?? node.name) : node.name}
        </h1>
        {schemaId && (
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
            {schemaId}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {fileType === "spec" && (
          <div
            className={classNames(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border",
              statusInfo.color,
            )}
          >
            <span className={classNames("w-2 h-2 rounded-full", statusInfo.dot)} />
            {statusInfo.label}
          </div>
        )}
        <div className="text-xs text-slate-400 flex items-center gap-1">
          <ClockIcon className="w-3 h-3" /> {lastModified ?? "-"}
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
    </>
  );

  return (
    <SectionLayout
      navChildren={navContent}
      tocSections={sections}
      activeSection={activeSection || sections[0]?.id || ""}
      onSectionClick={setActiveSection}
    >
      {sections.map((s) => (
        <ViewerSection key={s.id} id={s.id} title={s.title} Icon={s.icon}>
          {s.render()}
        </ViewerSection>
      ))}
    </SectionLayout>
  );
}

/* ========================================================================
 * TreeNodeItem
 * ======================================================================== */

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
        <div className="w-5 h-5 flex items-center justify-center mr-1 shrink-0">
          {node.type === "directory" &&
            (expanded ? (
              <ChevronDownIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronRightIcon className="w-3.5 h-3.5" />
            ))}
        </div>

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

        <span className="flex-1 truncate text-sm font-medium">{node.name}</span>

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
