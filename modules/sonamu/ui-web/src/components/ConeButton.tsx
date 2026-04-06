import { cn } from "@sonamu-kit/react-components";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { PineconeIcon } from "./PineconeIcon";

const coneButtonVariants = cva(
  "inline-flex items-center justify-center gap-1 hover:opacity-90 transition-opacity text-white rounded-[4px] cursor-pointer bg-[#cd6133]",
  {
    variants: {
      size: {
        sm: "text-xs h-6 aspect-square [&_svg]:size-4",
        md: "text-sm h-8 aspect-square [&_svg]:size-5",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

type ConeButtonProps = React.ComponentProps<"button"> & VariantProps<typeof coneButtonVariants>;

export const ConeButton = React.forwardRef<HTMLButtonElement, ConeButtonProps>(
  ({ className, size, ...props }, ref) => {
    return (
      <button
        type="button"
        title="Cone"
        className={cn(coneButtonVariants({ size, className }))}
        ref={ref}
        {...props}
      >
        <PineconeIcon />
      </button>
    );
  },
);

ConeButton.displayName = "ConeButton";
