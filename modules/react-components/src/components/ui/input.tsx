import { isFunction } from "radashi";
import * as React from "react";
import XIcon from "~icons/lucide/x";

import { type Override } from "../../lib/types";
import { cn } from "../../lib/utils";

export type InputProps = Override<
  React.ComponentProps<"input">,
  {
    onValueChange?: (value: string) => void;
    /**
     * 활성화 시 내용이 채워지면 오른쪽에 X 아이콘이 뜨고, 누르면 내용을 초기화한다.
     * controlled/uncontrolled 입력 모두 지원한다.
     */
    clearable?: boolean;
  }
>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onValueChange, onChange, clearable = false, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    // 전달된 ref와 내부 ref를 함께 채우는 콜백 ref
    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (isFunction(ref)) {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    // controlled면 value로, uncontrolled면 내부 상태로 내용 유무를 판단한다.
    const isControlled = props.value !== undefined;
    const [uncontrolledHasValue, setUncontrolledHasValue] = React.useState(
      () => String(props.defaultValue ?? "").length > 0,
    );
    const hasValue = isControlled ? String(props.value ?? "").length > 0 : uncontrolledHasValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!isControlled) {
        setUncontrolledHasValue(e.target.value.length > 0);
      }
      onValueChange?.(e.target.value);
      onChange?.(e);
    };

    const handleClear = () => {
      const node = innerRef.current;
      if (node) {
        // native value setter로 값을 비우고 input 이벤트를 dispatch하면
        // React의 value tracker가 변화를 인식해 controlled/uncontrolled 모두에서 onChange가 발화된다.
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        nativeInputValueSetter?.call(node, "");
        node.dispatchEvent(new Event("input", { bubbles: true }));
        node.focus();
      }
      if (!isControlled) {
        setUncontrolledHasValue(false);
      }
    };

    const showClear = clearable && hasValue && !props.disabled && !props.readOnly;

    const inputEl = (
      <input
        type={type}
        data-slot="input"
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base bg-input-background transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          clearable && "pr-8",
          className,
        )}
        ref={setRefs}
        {...props}
        onChange={handleChange}
      />
    );

    if (!clearable) {
      return inputEl;
    }

    return (
      <div className="relative w-full">
        {inputEl}
        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-muted-foreground opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
