"use client";

import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "../../lib/utils";

type SwitchProps = Omit<
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
  "onCheckedChange" | "onChange"
> & {
  name?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, name, checked, defaultChecked, onChange, onBlur, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    // biome-ignore lint/style/noNonNullAssertion: useImperativeHandle은 ref가 할당된 후 실행되므로 안전함
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleCheckedChange = (newChecked: boolean) => {
      if (onChange) {
        // Create a synthetic event with the new checked value
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
          defaultChecked={defaultChecked}
          onBlur={onBlur}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <SwitchPrimitives.Root
          checked={checked}
          defaultChecked={defaultChecked}
          onCheckedChange={handleCheckedChange}
          className={cn(
            "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
            className,
          )}
          {...props}
        >
          <SwitchPrimitives.Thumb
            className={cn(
              "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
            )}
          />
        </SwitchPrimitives.Root>
      </>
    );
  },
);

Switch.displayName = "Switch";

export { Switch };
