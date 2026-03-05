import { Button } from "@sonamu-kit/react-components";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import FileTextIcon from "~icons/lucide/file-text";
import FolderIcon from "~icons/lucide/folder";
import FolderOpenIcon from "~icons/lucide/folder-open";
import PencilIcon from "~icons/lucide/pencil";
import RefreshCwIcon from "~icons/lucide/refresh-cw";
import { useSonamuContext } from "../contexts/sonamu-provider";
import { defaultCatch } from "../services/sonamu.shared";
import type { CddTreeNode } from "../services/sonamu-ui.service";
import { SonamuUIService } from "../services/sonamu-ui.service";

export const Route = createFileRoute("/cdd")({
  component: CddPage,
});

function CddPage() {
  const { SD } = useSonamuContext();
  const { data, error, refetch } = SonamuUIService.useCddTree();
  const isLoading = !error && !data;

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">{SD("cdd.title")}</h1>
        <Button size="xs" onClick={() => refetch()}>
          <RefreshCwIcon className="w-3.5 h-3.5 mr-1" />
          {SD("cdd.refresh")}
        </Button>
      </div>

      {isLoading && <div className="text-text-muted">{SD("common.loading")}</div>}

      {error && <div className="text-red-500">{SD("common.error")}</div>}

      {data && !data.exists && (
        <div className="p-4 rounded-md bg-amber-900/40 border border-amber-500/50 text-amber-100">
          {SD("cdd.noContractDir")}
        </div>
      )}

      {data?.exists && (
        <div className="border border-white/10 rounded-md p-4 bg-black/20">
          {data.tree.map((node) => (
            <TreeNodeItem key={node.path} node={node} depth={0} onRefetch={refetch} />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeNodeItem({
  node,
  depth,
  onRefetch,
}: {
  node: CddTreeNode;
  depth: number;
  onRefetch: () => void;
}) {
  const { SD } = useSonamuContext();
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);

  const handleEdit = () => {
    setEditing(true);
    SonamuUIService.editCddContent(node.path)
      .then(() => {
        onRefetch();
      })
      .catch(defaultCatch)
      .finally(() => setEditing(false));
  };

  if (node.type === "directory") {
    return (
      <div>
        <button
          type="button"
          className="flex items-center gap-1.5 py-1 px-1 w-full text-left hover:bg-white/5 rounded cursor-pointer text-text-light"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDownIcon className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted" />
          )}
          {expanded ? (
            <FolderOpenIcon className="w-4 h-4 text-yellow-400" />
          ) : (
            <FolderIcon className="w-4 h-4 text-yellow-400" />
          )}
          <span className="font-medium">{node.name}</span>
        </button>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNodeItem key={child.path} node={child} depth={depth + 1} onRefetch={onRefetch} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 py-1 px-1 hover:bg-white/5 rounded"
      style={{ paddingLeft: `${depth * 1.25 + 1.25}rem` }}
    >
      <FileTextIcon className="w-4 h-4 text-text-muted" />
      <span>{node.name}</span>
      {node.fileType === "contract" && (
        <span className="text-[0.7em] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
          Contract
        </span>
      )}
      {node.fileType === "spec" && (
        <span className="text-[0.7em] px-1.5 py-0.5 rounded bg-green-500/20 text-green-300 font-medium">
          Spec
        </span>
      )}
      <button
        type="button"
        className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded text-[0.8em] bg-white/5 hover:bg-white/10 cursor-pointer text-text-muted hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleEdit}
        disabled={editing}
      >
        <PencilIcon className="w-3 h-3" />
        {editing ? SD("cdd.editing") : SD("cdd.editContent")}
      </button>
    </div>
  );
}
