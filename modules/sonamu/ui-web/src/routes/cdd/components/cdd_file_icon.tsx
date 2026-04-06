import classNames from "classnames";
import BookOpenIcon from "~icons/lucide/book-open";
import FileTextIcon from "~icons/lucide/file-text";
import ScaleIcon from "~icons/lucide/scale";

export function CddFileIcon({
  fileType,
  name,
  isActive,
  className,
}: {
  fileType?: "contract" | "rules";
  name: string;
  isActive?: boolean;
  className?: string;
}) {
  const size = className ?? "w-[18px] h-[18px]";
  const color = isActive ? "text-blue-600" : "text-gray-400";

  if (name === "main.contract.md") {
    return <BookOpenIcon className={classNames(size, color)} />;
  }
  if (fileType === "rules") {
    return <ScaleIcon className={classNames(size, color)} />;
  }
  return <FileTextIcon className={classNames(size, color)} />;
}
