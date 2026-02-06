import { Button } from "@sonamu-kit/react-components";
import classNames from "classnames";
import StickyNoteIcon from "~icons/lucide/sticky-note";

type PostItButtonProps = {
  color?: string;
  icon?: boolean;
  onClick: () => void;
  className?: string;
  size?: "sm" | "md";
};

export function PostItButton({
  color = "#ffeaa7",
  icon = false,
  onClick,
  className,
  size = "sm",
}: PostItButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={classNames(
        "inline-flex items-center justify-center gap-1 border border-gray-300 hover:opacity-80 transition-opacity",
        {
          "text-xs px-2 py-1 h-6": size === "sm",
          "text-sm px-3 py-1.5 h-8": size === "md",
        },
        className,
      )}
      style={{
        backgroundColor: color,
        color: "#2d3436",
        borderRadius: "4px",
      }}
    >
      {icon ? (
        <StickyNoteIcon className="w-4 h-4" />
      ) : (
        <>
          <StickyNoteIcon className="w-3 h-3" />
          <span>Post-it</span>
        </>
      )}
    </Button>
  );
}
