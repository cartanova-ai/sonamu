import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "../../lib/utils";

type SliderProps = Omit<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  "onValueChange" | "onChange"
> & {
  name?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
};

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, name, value, defaultValue, onChange, onBlur, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleValueChange = (newValue: number[]) => {
      if (onChange) {
        const syntheticEvent = {
          target: {
            name,
            type: "range",
            value: newValue[0]?.toString() || "",
            valueAsNumber: newValue[0] ?? 0,
          },
          currentTarget: {
            name,
            type: "range",
            value: newValue[0]?.toString() || "",
            valueAsNumber: newValue[0] ?? 0,
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
          type="range"
          ref={inputRef}
          name={name}
          defaultValue={defaultValue?.[0]}
          onBlur={onBlur}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <SliderPrimitive.Root
          value={value}
          defaultValue={defaultValue}
          onValueChange={handleValueChange}
          className={cn("relative flex w-full touch-none select-none items-center", className)}
          {...props}
        >
          <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
        </SliderPrimitive.Root>
      </>
    );
  },
);

Slider.displayName = "Slider";

export { Slider };
