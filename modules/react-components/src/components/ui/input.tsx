import * as React from "react";

import { cn } from "../../lib/utils";

export type InputProps = Omit<React.ComponentProps<"input">, "onChange"> & {
  onChange?: (
    event: React.ChangeEvent<HTMLInputElement>,
    data: { value: string }
  ) => void;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, ...props }, ref) => {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
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
  }
);
Input.displayName = "Input";

export { Input };
