import classNames from "classnames";
import { useState } from "react";
import ChevronDownIcon from "~icons/lucide/chevron-down";
import ChevronRightIcon from "~icons/lucide/chevron-right";
import FolderIcon from "~icons/lucide/folder";
import FolderOpenIcon from "~icons/lucide/folder-open";
import PencilIcon from "~icons/lucide/pencil";
import { useSonamuContext } from "../../../contexts/sonamu-provider";
import { defaultCatch } from "../../../services/sonamu.shared";
import { CddService } from "../service";
import type { CddTreeNode } from "../types";
import { CddFileIcon } from "./cdd_file_icon";

export function CddTreeNodeItem({
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
    CddService.editCddContent(node.path)
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
            <CddTreeNodeItem
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
