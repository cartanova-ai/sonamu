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
    label?: React.ReactNode;
    labelClassName?: string;
  }
>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      name,
      checked,
      defaultChecked,
      onValueChange,
      onBlur,
      label,
      labelClassName,
      disabled,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const checkboxRef = React.useRef<HTMLButtonElement>(null);
    const labelId = React.useId();

    // biome-ignore lint/style/noNonNullAssertion: useImperativeHandle은 ref가 할당된 후 실행되므로 안전함
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleCheckedChange = (newChecked: boolean | "indeterminate") => {
      const boolValue = newChecked === "indeterminate" ? false : newChecked;
      onValueChange?.(boolValue);
    };

    const handleLabelClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (disabled) return;
      checkboxRef.current?.click();
    };

    const checkboxElement = (
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
          ref={checkboxRef}
          data-slot="checkbox"
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={handleCheckedChange}
          disabled={disabled}
          aria-labelledby={label ? labelId : undefined}
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

    if (label) {
      return (
        <div className="flex items-center gap-2">
          {checkboxElement}
          <label
            id={labelId}
            className={cn(
              "cursor-pointer select-none",
              disabled && "cursor-not-allowed opacity-50",
              labelClassName,
            )}
            onClick={handleLabelClick}
          >
            {label}
          </label>
        </div>
      );
    }

    return checkboxElement;
  },
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
