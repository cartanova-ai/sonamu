import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";
import type { Override } from "../../lib/helpers";
import { cn } from "../../lib/utils";

type SliderProps = Override<
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>,
  {
    name?: string;
    onValueChange?: (value: number) => void;
    onBlur?: React.FocusEventHandler<HTMLInputElement>;
  }
>;

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ className, name, value, defaultValue, onValueChange, onBlur, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    // biome-ignore lint/style/noNonNullAssertion: useImperativeHandle은 ref가 할당된 후 실행되므로 안전함
    React.useImperativeHandle(ref, () => inputRef.current!);

    const handleValueChange = (values: number[]) => {
      onValueChange?.(values[0]);
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
