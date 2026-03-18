import classNames from "classnames";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import CheckCircle2Icon from "~icons/lucide/check-circle-2";

import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import HashIcon from "~icons/lucide/hash";
import Link2Icon from "~icons/lucide/link-2";
import PencilIcon from "~icons/lucide/pencil";
import { useSonamuContext } from "../../../contexts/sonamu-provider";
import { defaultCatch } from "../../../services/sonamu.shared";
import { buildCustomFieldSections } from "../field-renderers/registry";
import { CddService } from "../service";
import type {
  AcceptanceCriterion,
  CddContentEnvelope,
  CddTreeNode,
  SectionDescriptor,
} from "../types";
import { featureToSpecPath, resolveRefPath } from "../utils/document-path";
import { CddFileIcon } from "./cdd_file_icon";
import { CddSectionLayout, ViewerSection } from "./cdd_section_layout";

const STATUS_MAP: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600 border-gray-200", dot: "bg-gray-400" },
  specifying: {
    label: "Specifying",
    color: "bg-amber-50 text-amber-600 border-amber-200",
    dot: "bg-amber-500",
  },
  implementing: {
    label: "Implementing",
    color: "bg-blue-50 text-blue-600 border-blue-200",
    dot: "bg-blue-500",
  },
  validating: {
    label: "Validating",
    color: "bg-violet-50 text-violet-600 border-violet-200",
    dot: "bg-violet-500",
  },
  done: {
    label: "Done",
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    dot: "bg-emerald-500",
  },
};

export function CddDocumentDetail({
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
  const { data, isLoading, refetch: refetchContent } = CddService.useReadCddContent(node.path);
  const [activeSection, setActiveSection] = useState("");

  const envelope: CddContentEnvelope | null = data ?? null;
  const doc = envelope?.document ?? {};
  const schema = envelope?.schema ?? null;
  const fileType = envelope?.fileType ?? node.fileType ?? "contract";

  const handleEdit = () => {
    setEditing(true);
    CddService.editCddContent(node.path)
      .then(() => {
        onRefetch();
        refetchContent();
      })
      .catch(defaultCatch)
      .finally(() => setEditing(false));
  };

  const contractDir = node.path.includes("/")
    ? node.path.substring(0, node.path.lastIndexOf("/"))
    : "";

  const sections = useMemo((): SectionDescriptor[] => {
    const result: SectionDescriptor[] = [];

    if (fileType === "contract") {
      const features = doc.features as Record<string, string> | undefined;
      if (features && Object.keys(features).length > 0) {
        result.push({
          id: "contract-features",
          title: "Features",
          icon: FileCodeIcon,
          render: () => (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50/50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
                      Feature
                    </th>
                    <th className="px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {Object.entries(features).map(([key, desc]) => (
                    <tr key={key} className="group hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          className="font-mono text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                          onClick={() => onSelect(featureToSpecPath(contractDir, key))}
                        >
                          {key}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 leading-relaxed">{desc}</td>
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
      const description = doc.description as string[] | undefined;
      if (description && description.length > 0) {
        result.push({
          id: "spec-summary",
          title: "Overview",
          icon: FileTextIcon,
          render: () => (
            <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-code:bg-slate-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-900 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none">
              <Markdown>{description.join("\n")}</Markdown>
            </div>
          ),
        });
      }

      const criteria = doc.acceptanceCriteria as (AcceptanceCriterion | string)[] | undefined;
      if (criteria && criteria.length > 0) {
        result.push({
          id: "spec-criteria",
          title: "Acceptance Criteria",
          icon: CheckCircle2Icon,
          render: () => (
            <div className="space-y-2">
              {criteria.map((item, i) => {
                if (typeof item === "string") {
                  return (
                    <div key={i} className="flex gap-3 items-start group">
                      <div className="mt-1 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0">
                        <CheckCircle2Icon className="w-4 h-4" />
                      </div>
                      <p className="text-slate-600 text-sm leading-relaxed group-hover:text-slate-900 transition-colors">
                        {item}
                      </p>
                    </div>
                  );
                }
                return (
                  <div
                    key={item.id}
                    className="border border-slate-200 rounded-lg p-3 space-y-1.5 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2Icon className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="text-[11px] font-mono text-slate-400">{item.id}</span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{item.condition}</p>
                    {item.testRef?.target && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span>{item.testRef.target}</span>
                        {item.testRef.pattern && (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>/{item.testRef.pattern}/</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ),
        });
      }
    }

    result.push(...buildCustomFieldSections(schema, doc, fileType));

    if (fileType === "spec") {
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {hasSources && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Sources
                  </h4>
                  {sources.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 cursor-pointer transition-colors group text-left"
                      onClick={() => CddService.openCddSource(s).catch(defaultCatch)}
                    >
                      <Link2Icon className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-blue-400" />
                      <span className="truncate">{s}</span>
                    </button>
                  ))}
                </div>
              )}
              {(hasContracts || hasDependsOnSpecs) && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Related
                  </h4>
                  <div className="flex flex-col gap-1.5">
                    {contracts?.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 cursor-pointer transition-colors group text-left"
                        onClick={() => onSelect(resolveRefPath(node.path, c))}
                      >
                        <HashIcon className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-blue-400" />
                        <span className="truncate">{c}</span>
                      </button>
                    ))}
                    {dependsOnSpecs?.map((d) => (
                      <button
                        type="button"
                        key={d}
                        className="flex items-center gap-2 text-xs text-slate-600 hover:text-blue-600 cursor-pointer transition-colors group text-left"
                        onClick={() => onSelect(resolveRefPath(node.path, d))}
                      >
                        <HashIcon className="w-3.5 h-3.5 shrink-0 text-slate-300 group-hover:text-blue-400" />
                        <span className="truncate">{d}</span>
                      </button>
                    ))}
                  </div>
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
  const schemaId = doc.schema as string | undefined;
  const statusInfo = STATUS_MAP[status ?? ""] ?? STATUS_MAP.draft;

  const navContent = (
    <>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white shrink-0">
          <CddFileIcon fileType={node.fileType} name={node.name} className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-bold leading-none mb-0.5 truncate">
            {fileType === "spec" ? (summary ?? node.name) : node.name}
          </h1>
          <p className="text-[10px] text-slate-400 font-medium">{schemaId || "-"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {fileType === "spec" && (
          <div className="flex items-center gap-1.5 mr-2">
            <span className={classNames("w-1.5 h-1.5 rounded-full", statusInfo.dot)} />
            <span className="text-xs font-medium text-slate-500">{statusInfo.label}</span>
          </div>
        )}
        <button
          type="button"
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleEdit}
          disabled={editing}
        >
          <PencilIcon className="w-3 h-3" />
          {editing ? SD("cdd.editing") : SD("cdd.editContent")}
        </button>
      </div>
    </>
  );

  return (
    <CddSectionLayout
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
    </CddSectionLayout>
  );
}
