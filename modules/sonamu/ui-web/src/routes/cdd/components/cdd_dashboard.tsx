import classNames from "classnames";
import { useMemo, useState } from "react";
import AlertTriangleIcon from "~icons/lucide/alert-triangle";
import BarChart3Icon from "~icons/lucide/bar-chart-3";
import CheckCircle2Icon from "~icons/lucide/check-circle-2";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import FilterIcon from "~icons/lucide/filter";
import FolderIcon from "~icons/lucide/folder";
import { CddService } from "../service";
import type { CddDashboardData, CddDocumentSummary, CddSpecStatus } from "../types";

/** 문서 경로에서 도메인(최상위 디렉터리)을 추출. 루트 파일은 "(root)" */
function getDomain(docPath: string): string {
  const slashIdx = docPath.indexOf("/");
  if (slashIdx === -1) return "(root)";
  return docPath.substring(0, slashIdx);
}

const STATUS_CONFIG: Record<
  CddSpecStatus,
  { label: string; color: string; bg: string; barColor: string }
> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100", barColor: "bg-gray-400" },
  specifying: {
    label: "Specifying",
    color: "text-amber-600",
    bg: "bg-amber-50",
    barColor: "bg-amber-400",
  },
  implementing: {
    label: "Implementing",
    color: "text-blue-600",
    bg: "bg-blue-50",
    barColor: "bg-blue-500",
  },
  validating: {
    label: "Validating",
    color: "text-violet-600",
    bg: "bg-violet-50",
    barColor: "bg-violet-500",
  },
  done: {
    label: "Done",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    barColor: "bg-emerald-500",
  },
};

const ALL_STATUSES: CddSpecStatus[] = ["draft", "specifying", "implementing", "validating", "done"];

export function CddDashboard({
  onNavigateToDocument,
}: {
  onNavigateToDocument: (path: string) => void;
}) {
  const { data, isLoading, error } = CddService.useCddDashboard();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Loading dashboard...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm">
        Failed to load dashboard
      </div>
    );
  }

  if (!data.exists) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-gray-100 flex items-center px-8 shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-800 font-semibold">
            <BarChart3Icon className="w-4 h-4" />
            <span>Dashboard</span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-12">
          <div className="text-center space-y-3">
            <AlertTriangleIcon className="w-12 h-12 mx-auto text-amber-300" />
            <p className="text-sm text-gray-600 font-medium">contract/ directory not found</p>
            <p className="text-xs text-gray-400">
              Create a <code className="bg-gray-100 px-1 py-0.5 rounded">contract/</code> directory
              in the project root to start using CDD.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 border-b border-gray-100 flex items-center px-8 shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-800 font-semibold">
          <BarChart3Icon className="w-4 h-4" />
          <span>Dashboard</span>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        <DashboardStats data={data} />
        <DashboardTable data={data} onNavigateToDocument={onNavigateToDocument} />
      </div>
    </div>
  );
}

function DashboardStats({ data }: { data: CddDashboardData }) {
  const { stats } = data;
  const totalSpecs = stats.totalSpecs;
  const doneCount = stats.statusDistribution.done;
  const completionRate = totalSpecs > 0 ? Math.round((doneCount / totalSpecs) * 100) : 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        label="Contracts"
        value={stats.totalContracts}
        icon={<FileTextIcon className="w-5 h-5 text-blue-500" />}
        accent="bg-blue-50"
      />
      <StatCard
        label="Specs"
        value={stats.totalSpecs}
        icon={<FileCodeIcon className="w-5 h-5 text-violet-500" />}
        accent="bg-violet-50"
      />
      <StatCard
        label="Completion"
        value={`${completionRate}%`}
        icon={<CheckCircle2Icon className="w-5 h-5 text-emerald-500" />}
        accent="bg-emerald-50"
        sub={`${doneCount} / ${totalSpecs} specs`}
      />
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-xs font-medium text-gray-500 mb-3">Status Distribution</div>
        <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-gray-100">
          {ALL_STATUSES.map((status) => {
            const count = stats.statusDistribution[status];
            if (count === 0 || totalSpecs === 0) return null;
            const pct = (count / totalSpecs) * 100;
            return (
              <div
                key={status}
                className={classNames("h-full", STATUS_CONFIG[status].barColor)}
                style={{ width: `${pct}%` }}
                title={`${STATUS_CONFIG[status].label}: ${count}`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
          {ALL_STATUSES.map((status) => {
            const count = stats.statusDistribution[status];
            if (count === 0) return null;
            return (
              <div key={status} className="flex items-center gap-1 text-[10px] text-gray-500">
                <div
                  className={classNames("w-2 h-2 rounded-full", STATUS_CONFIG[status].barColor)}
                />
                <span>
                  {STATUS_CONFIG[status].label} {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <div className={classNames("w-8 h-8 rounded-lg flex items-center justify-center", accent)}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function DashboardTable({
  data,
  onNavigateToDocument,
}: {
  data: CddDashboardData;
  onNavigateToDocument: (path: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<CddSpecStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "contract" | "spec">("all");
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const allDomains = useMemo(() => {
    const set = new Set(data.documents.map((d) => getDomain(d.path)));
    return Array.from(set).sort((a, b) => {
      if (a === "(root)") return -1;
      if (b === "(root)") return 1;
      return a.localeCompare(b);
    });
  }, [data.documents]);

  const { grouped, totalFiltered } = useMemo(() => {
    let docs = data.documents;
    if (domainFilter !== "all") {
      docs = docs.filter((d) => getDomain(d.path) === domainFilter);
    }
    if (typeFilter !== "all") {
      docs = docs.filter((d) => d.fileType === typeFilter);
    }
    if (statusFilter !== "all") {
      docs = docs.filter((d) => d.status === statusFilter);
    }

    const groups = new Map<string, CddDocumentSummary[]>();
    for (const doc of docs) {
      const domain = getDomain(doc.path);
      const list = groups.get(domain) ?? [];
      list.push(doc);
      groups.set(domain, list);
    }

    const sortedGroups: { domain: string; docs: CddDocumentSummary[] }[] = [];
    for (const [domain, domainDocs] of groups) {
      domainDocs.sort((a, b) => {
        if (a.fileType !== b.fileType) return a.fileType === "contract" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      sortedGroups.push({ domain, docs: domainDocs });
    }
    sortedGroups.sort((a, b) => {
      if (a.domain === "(root)") return -1;
      if (b.domain === "(root)") return 1;
      return a.domain.localeCompare(b.domain);
    });

    return { grouped: sortedGroups, totalFiltered: docs.length };
  }, [data.documents, domainFilter, statusFilter, typeFilter]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          Documents
          <span className="text-xs font-normal text-gray-400">({totalFiltered})</span>
        </div>
        <div className="flex items-center gap-2">
          <FilterIcon className="w-3.5 h-3.5 text-gray-400" />
          <select
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 outline-none"
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value)}
          >
            <option value="all">All Domains</option>
            {allDomains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 outline-none"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "contract" | "spec")}
          >
            <option value="all">All Types</option>
            <option value="contract">Contracts</option>
            <option value="spec">Specs</option>
          </select>
          <select
            className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-600 outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CddSpecStatus | "all")}
          >
            <option value="all">All Statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
            <th className="text-left font-medium px-5 py-2.5">Name</th>
            <th className="text-left font-medium px-3 py-2.5 w-20">Type</th>
            <th className="text-left font-medium px-3 py-2.5 w-28">Status</th>
            <th className="text-center font-medium px-3 py-2.5 w-12">AC</th>
            <th className="text-center font-medium px-3 py-2.5 w-16">Sources</th>
            <th className="text-left font-medium px-3 py-2.5 w-28">Modified</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ domain, docs }) => (
            <DomainGroup
              key={domain}
              domain={domain}
              docs={docs}
              onNavigateToDocument={onNavigateToDocument}
            />
          ))}
          {totalFiltered === 0 && (
            <tr>
              <td colSpan={6} className="text-center py-8 text-gray-400 text-xs">
                No documents match the current filter
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DomainGroup({
  domain,
  docs,
  onNavigateToDocument,
}: {
  domain: string;
  docs: CddDocumentSummary[];
  onNavigateToDocument: (path: string) => void;
}) {
  return (
    <>
      <tr className="bg-gray-50/70">
        <td colSpan={6} className="px-5 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
            <FolderIcon className="w-3.5 h-3.5 text-gray-400" />
            {domain}
            <span className="font-normal text-gray-400">({docs.length})</span>
          </div>
        </td>
      </tr>
      {docs.map((doc) => (
        <DocumentRow key={doc.path} doc={doc} onClick={() => onNavigateToDocument(doc.path)} />
      ))}
    </>
  );
}

function DocumentRow({ doc, onClick }: { doc: CddDocumentSummary; onClick: () => void }) {
  const domain = getDomain(doc.path);
  const fullDir = doc.path.includes("/") ? doc.path.substring(0, doc.path.lastIndexOf("/")) : null;
  const subDir = fullDir && fullDir !== domain ? fullDir.substring(domain.length + 1) : null;

  if (doc.parseError) {
    return (
      <tr className="border-b border-gray-50 bg-red-50/50">
        <td className="px-5 py-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-red-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-gray-800 font-medium truncate">{doc.name}</div>
              {subDir && <div className="text-[10px] text-gray-400 truncate">{subDir}</div>}
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-50 text-red-600">
            error
          </span>
        </td>
        <td
          colSpan={4}
          className="px-3 py-2.5 text-xs text-red-500 truncate"
          title={doc.parseError}
        >
          {doc.parseError}
        </td>
      </tr>
    );
  }

  return (
    <tr
      className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <td className="px-5 py-2.5">
        <div className="flex items-center gap-2">
          {doc.fileType === "contract" ? (
            <FileTextIcon className="w-4 h-4 text-blue-400 shrink-0" />
          ) : (
            <FileCodeIcon className="w-4 h-4 text-violet-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-gray-800 font-medium truncate">{doc.name}</div>
            {subDir && <div className="text-[10px] text-gray-400 truncate">{subDir}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={classNames(
            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
            doc.fileType === "contract"
              ? "bg-blue-50 text-blue-600"
              : "bg-violet-50 text-violet-600",
          )}
        >
          {doc.fileType}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {doc.status ? (
          <span
            className={classNames(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1",
              STATUS_CONFIG[doc.status].bg,
              STATUS_CONFIG[doc.status].color,
            )}
          >
            <span
              className={classNames("w-1.5 h-1.5 rounded-full", STATUS_CONFIG[doc.status].barColor)}
            />
            {STATUS_CONFIG[doc.status].label}
          </span>
        ) : (
          <span className="text-gray-300 text-xs">-</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-center text-xs text-gray-500">
        {doc.acceptanceCriteriaCount != null ? doc.acceptanceCriteriaCount : "-"}
      </td>
      <td className="px-3 py-2.5 text-center text-xs text-gray-500">
        {doc.sourceCount != null ? doc.sourceCount : "-"}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400">{doc.lastModified ?? "-"}</td>
    </tr>
  );
}
