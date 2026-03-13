import classNames from "classnames";
import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import CheckCircle2Icon from "~icons/lucide/check-circle-2";
import ClockIcon from "~icons/lucide/clock";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";
import HashIcon from "~icons/lucide/hash";
import Link2Icon from "~icons/lucide/link-2";
import PencilIcon from "~icons/lucide/pencil";
import { useSonamuContext } from "../../../contexts/sonamu-provider";
import { defaultCatch } from "../../../services/sonamu.shared";
import { buildCustomFieldSections } from "../field-renderers/registry";
import { CddService } from "../service";
import type { CddContentEnvelope, CddTreeNode, SectionDescriptor } from "../types";
import { featureToSpecPath, resolveRefPath } from "../utils/document-path";
import { CddFileIcon } from "./cdd_file_icon";
import { CddSectionLayout, ViewerSection } from "./cdd_section_layout";

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
                          onClick={() => onSelect(featureToSpecPath(contractDir, key))}
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
                      onClick={() => CddService.openCddSource(s).catch(defaultCatch)}
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
                      onClick={() => onSelect(resolveRefPath(node.path, c))}
                    >
                      <HashIcon className="w-3 h-3 shrink-0" /> {c}
                    </button>
                  ))}
                  {dependsOnSpecs?.map((d) => (
                    <button
                      type="button"
                      key={d}
                      className="flex items-center gap-2 text-xs text-slate-500 hover:text-blue-600 cursor-pointer transition-colors"
                      onClick={() => onSelect(resolveRefPath(node.path, d))}
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
