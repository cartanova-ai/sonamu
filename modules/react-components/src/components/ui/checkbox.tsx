"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as React from "react";
import CheckIcon from "~icons/lucide/check";
import type { Override } from "../../lib/types";
import { cn } from "../../lib/utils";

type CheckboxProps = Override<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  {
    name?: string;
    onValueChange?: (checked: boolean) => void;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
  }
>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, name, checked, defaultChecked, onValueChange, onBlur, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    // biome-ignore lint/style/noNonNullAssertion: useImperativeHandle은 ref가 할당된 후 실행되므로 안전함
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleCheckedChange = (newChecked: boolean | "indeterminate") => {
      const boolValue = newChecked === "indeterminate" ? false : newChecked;
      onValueChange?.(boolValue);
    };

    return (
      <>
        <input
          type="checkbox"
          ref={inputRef}
          name={name}
          defaultChecked={defaultChecked === true}
          onBlur={onBlur}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <CheckboxPrimitive.Root
          data-slot="checkbox"
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={handleCheckedChange}
          className={cn(
            "peer border border-muted-foreground/30 bg-input-background dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        >
          <CheckboxPrimitive.Indicator
            data-slot="checkbox-indicator"
            className="flex items-center justify-center text-current transition-none"
          >
            <CheckIcon className="size-3.5" />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
      </>
    );
  },
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
