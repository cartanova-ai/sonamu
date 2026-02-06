import { cn } from "@sonamu-kit/react-components";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import BiSticky from "~icons/bi/sticky";

const postItButtonVariants = cva(
  "inline-flex items-center justify-center gap-1 border border-gray-300 hover:opacity-80 transition-opacity text-[#2d3436] rounded-[4px] cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-postit-bg)]",
        entity: "bg-[var(--color-postit-entity)]",
      },
      size: {
        sm: "text-xs px-2 py-1 h-6 [&_svg]:size-3.5",
        md: "text-sm px-3 py-1.5 h-8 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

type PostItButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof postItButtonVariants>;

export const PostItButton = React.forwardRef<HTMLButtonElement, PostItButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        type="button"
        title="Post-it"
        className={cn(postItButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        <BiSticky />
      </button>
    );
  },
);

PostItButton.displayName = "PostItButton";
