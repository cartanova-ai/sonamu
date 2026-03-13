import classNames from "classnames";
import FileCodeIcon from "~icons/lucide/file-code";
import FileTextIcon from "~icons/lucide/file-text";

export function CddFileIcon({
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
