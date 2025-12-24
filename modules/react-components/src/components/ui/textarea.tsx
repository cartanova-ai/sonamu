import * as React from "react";

import { cn } from "../../lib/utils";

export type TextareaProps = Omit<React.ComponentProps<"textarea">, "onChange"> & {
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>, data: { value: string }) => void;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, onChange, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onChange={(e) => {
          if (onChange) {
            onChange(e, { value: e.target.value });
          }
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
