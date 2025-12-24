"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";

import { cn } from "../../lib/utils";

type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "onCheckedChange" | "onChange"
> & {
  name?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, name, checked, defaultChecked, onChange, onBlur, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleCheckedChange = (newChecked: boolean | "indeterminate") => {
      if (onChange && newChecked !== "indeterminate") {
        const syntheticEvent = {
          target: {
            name,
            type: "checkbox",
            checked: newChecked,
            value: newChecked ? "on" : "",
          },
          currentTarget: {
            name,
            type: "checkbox",
            checked: newChecked,
            value: newChecked ? "on" : "",
          },
          preventDefault: () => {},
          stopPropagation: () => {},
        } as React.ChangeEvent<HTMLInputElement>;

        onChange(syntheticEvent);
      }
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
}
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
