import { Button } from "@sonamu-kit/react-components";
import classNames from "classnames";
import BiSticky from "~icons/bi/sticky";

type PostItButtonProps = {
  color?: string;
  onClick: () => void;
  className?: string;
  size?: "sm" | "md";
};

export function PostItButton({
  color = "#ffeaa7",
  onClick,
  className,
  size = "sm",
}: PostItButtonProps) {
  // color prop이 기본값인 경우 Tailwind 클래스 사용, 아니면 inline style 사용
  const isDefaultColor = color === "#ffeaa7";

  return (
    <Button
      type="button"
      title="Post-it"
      onClick={onClick}
      className={classNames(
        "inline-flex items-center justify-center gap-1 border border-gray-300 hover:opacity-80 transition-opacity text-[#2d3436] rounded-[4px]",
        {
          "text-xs px-2 py-1 h-6": size === "sm",
          "text-sm px-3 py-1.5 h-8": size === "md",
          "bg-[--color-postit-bg]": isDefaultColor,
        },
        className,
      )}
      style={!isDefaultColor ? { backgroundColor: color } : undefined}
      icon={<BiSticky />}
    />
  );
}
