import * as React from "react";
import type { Override } from "../../lib/types";
import { cn } from "../../lib/utils";

export type TextareaProps = Override<
  React.ComponentProps<"textarea">,
  {
    onValueChange?: (value: string) => void;
  }
>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onValueChange, onChange, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onValueChange?.(e.target.value);
      onChange?.(e);
    };

    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
        onChange={handleChange}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
